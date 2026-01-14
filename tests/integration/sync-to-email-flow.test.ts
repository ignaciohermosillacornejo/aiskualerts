import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import type { EmailClient, SendEmailParams, SendEmailResult } from "@/email/resend-client";
import type { BsaleClient } from "@/bsale/client";
import type { StockItem, Variant } from "@/bsale/types";
import type { Alert } from "@/db/repositories/types";
import { TenantRepository } from "@/db/repositories/tenant";
import { UserRepository } from "@/db/repositories/user";
import { ThresholdRepository } from "@/db/repositories/threshold";
import { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import { AlertRepository } from "@/db/repositories/alert";
import { syncTenant, type TenantSyncDependencies } from "@/sync/tenant-sync";
import { generateAlertsForUser } from "@/alerts/alert-generator";
import type { AlertGeneratorDependencies } from "@/alerts/types";
import { runDigestJob, type DigestJobDependencies } from "@/jobs/digest-job";
import {
  createTestDb,
  cleanDatabase,
  dropAllTables,
  waitForDatabase,
} from "./db/helpers";

/**
 * Integration Test: Sync -> Alerts -> Email Flow
 *
 * This test verifies the complete flow:
 * 1. Sync job fetches inventory from Bsale (mocked)
 * 2. Alert generator creates alerts when stock falls below thresholds
 * 3. Digest job sends email notifications and marks alerts as sent
 *
 * Prerequisites:
 * - PostgreSQL test database running via docker-compose
 * - Run: docker-compose -f docker-compose.test.yml up -d
 */

// Mock BsaleClient factory
function createMockBsaleClient(stocks: StockItem[], variants: Map<number, Variant>): BsaleClient {
  return {
    async *getAllStocks(): AsyncGenerator<StockItem, void, undefined> {
      for (const stock of stocks) {
        yield stock;
      }
    },
    async getVariant(variantId: number): Promise<Variant> {
      const variant = variants.get(variantId);
      if (!variant) {
        throw new Error(`Variant ${String(variantId)} not found`);
      }
      return variant;
    },
    async getVariantsBatch(variantIds: number[]): Promise<Map<number, Variant>> {
      const result = new Map<number, Variant>();
      for (const id of variantIds) {
        const variant = variants.get(id);
        if (variant) {
          result.set(id, variant);
        }
      }
      return result;
    },
  } as BsaleClient;
}

// Mock EmailClient that records sent emails
interface SentEmail {
  to: string;
  subject: string;
  html: string;
}

function createMockEmailClient(): EmailClient & { getSentEmails: () => SentEmail[] } {
  const sentEmails: SentEmail[] = [];

  return {
    async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
      sentEmails.push({
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      return { success: true, id: `mock-email-${String(sentEmails.length)}` };
    },
    getSentEmails() {
      return sentEmails;
    },
  };
}

// Test configuration
function createTestConfig(): Config {
  return {
    port: 3000,
    nodeEnv: "test",
    allowedOrigins: [],
    syncEnabled: true,
    syncHour: 2,
    syncMinute: 0,
    syncBatchSize: 100,
    syncTenantDelay: 0,
    digestEnabled: false,
    digestHour: 8,
    digestMinute: 0,
    resendApiKey: "test-api-key",
    notificationFromEmail: "test@aiskualerts.com",
    sentryEnvironment: "test",
    mercadoPagoPlanAmount: 9990,
    mercadoPagoPlanCurrency: "CLP",
    magicLinkExpiryMinutes: 15,
    magicLinkRateLimitPerHour: 5,
  };
}

describe("Sync -> Alerts -> Email Integration Flow", () => {
  let db: DatabaseClient;
  let tenantRepo: TenantRepository;
  let userRepo: UserRepository;
  let thresholdRepo: ThresholdRepository;
  let snapshotRepo: StockSnapshotRepository;
  let alertRepo: AlertRepository;

  beforeAll(async () => {
    await waitForDatabase();
    db = createTestDb();

    const isCI = process.env["CI"] === "true";
    if (!isCI) {
      await dropAllTables(db);
      await db.initSchema();
    }

    tenantRepo = new TenantRepository(db);
    userRepo = new UserRepository(db);
    thresholdRepo = new ThresholdRepository(db);
    snapshotRepo = new StockSnapshotRepository(db);
    alertRepo = new AlertRepository(db);
  }, 30000);

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  }, 10000);

  describe("Complete flow: sync -> alerts -> email", () => {
    test("should create alerts for low stock and send digest email", async () => {
      // 1. Setup: Create test tenant
      const tenant = await tenantRepo.create({
        bsale_client_code: "TEST-001",
        bsale_client_name: "Test Company",
        bsale_access_token: "mock-token",
      });

      // 2. Setup: Create test user with notifications enabled
      const user = await userRepo.create({
        tenant_id: tenant.id,
        email: "user@test.com",
        name: "Test User",
        notification_enabled: true,
        digest_frequency: "daily",
      });

      // 3. Setup: Create thresholds for specific variants
      // Threshold 1: min_quantity = 20 for variant 1001
      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 1001,
        bsale_office_id: null,
        min_quantity: 20,
        days_warning: 7,
      });

      // Threshold 2: min_quantity = 50 for variant 1002
      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 1002,
        bsale_office_id: null,
        min_quantity: 50,
        days_warning: 7,
      });

      // Threshold 3: min_quantity = 10 for variant 1003 (will NOT trigger alert)
      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 1003,
        bsale_office_id: null,
        min_quantity: 10,
        days_warning: 7,
      });

      // 4. Mock Bsale data - stocks below thresholds
      const mockStocks: StockItem[] = [
        {
          id: 1,
          quantity: 15,
          quantityReserved: 0,
          quantityAvailable: 15, // Below threshold of 20
          variant: { href: "/v1/variants/1001.json", id: 1001 },
          office: null,
        },
        {
          id: 2,
          quantity: 30,
          quantityReserved: 0,
          quantityAvailable: 30, // Below threshold of 50
          variant: { href: "/v1/variants/1002.json", id: 1002 },
          office: null,
        },
        {
          id: 3,
          quantity: 100,
          quantityReserved: 0,
          quantityAvailable: 100, // Above threshold of 10
          variant: { href: "/v1/variants/1003.json", id: 1003 },
          office: null,
        },
      ];

      const mockVariants = new Map<number, Variant>([
        [1001, { id: 1001, code: "SKU-001", barCode: "123456", description: "Product A", product: { name: "Product A" } }],
        [1002, { id: 1002, code: "SKU-002", barCode: "789012", description: "Product B", product: { name: "Product B" } }],
        [1003, { id: 1003, code: "SKU-003", barCode: "345678", description: "Product C", product: { name: "Product C" } }],
      ]);

      // 5. Run sync with mock Bsale client
      const syncDeps: TenantSyncDependencies = {
        tenantRepo,
        snapshotRepo,
        createBsaleClient: () => createMockBsaleClient(mockStocks, mockVariants),
      };

      const syncResult = await syncTenant(tenant, syncDeps, { batchSize: 100, delayBetweenTenants: 0 });

      // Verify sync succeeded
      expect(syncResult.success).toBe(true);
      expect(syncResult.itemsSynced).toBe(3);

      // 6. Generate alerts for the user
      const alertDeps: AlertGeneratorDependencies = {
        getThresholdsByUser: (userId: string) => thresholdRepo.getByUser(userId),
        getStockSnapshot: (tid: string, variantId: number, officeId: number | null) =>
          snapshotRepo.getByVariant(tid, variantId, officeId),
        getHistoricalSnapshots: (tid: string, variantId: number, officeId: number | null, days: number) =>
          snapshotRepo.getHistoricalSnapshots(tid, variantId, officeId, days),
        hasPendingAlert: (userId: string, variantId: number, officeId: number | null, alertType) =>
          alertRepo.hasPendingAlert(userId, variantId, officeId, alertType),
        createAlerts: (alerts) => alertRepo.createBatch(alerts),
      };

      const alertResult = await generateAlertsForUser(user.id, tenant.id, alertDeps);

      // Verify alerts created
      expect(alertResult.alertsCreated).toBe(2); // Two products below threshold
      expect(alertResult.errors).toHaveLength(0);

      // Verify alerts in database
      const pendingAlerts = await alertRepo.getPendingByUser(user.id);
      expect(pendingAlerts).toHaveLength(2);

      const alertTypes = pendingAlerts.map((a) => a.alert_type);
      expect(alertTypes).toContain("low_stock");

      const alertSkus = pendingAlerts.map((a) => a.sku);
      expect(alertSkus).toContain("SKU-001");
      expect(alertSkus).toContain("SKU-002");

      // 7. Run digest job with mock email client
      const mockEmailClient = createMockEmailClient();
      const config = createTestConfig();

      const digestDeps: DigestJobDependencies = {
        db,
        config,
        emailClient: mockEmailClient,
      };

      const digestResult = await runDigestJob(digestDeps, "daily");

      // Verify digest job results
      expect(digestResult.tenantsProcessed).toBe(1);
      expect(digestResult.emailsSent).toBe(1);
      expect(digestResult.emailsFailed).toBe(0);
      expect(digestResult.alertsMarkedSent).toBe(2);
      expect(digestResult.errors).toHaveLength(0);

      // 8. Verify email was sent
      const sentEmails = mockEmailClient.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]?.to).toBe("user@test.com");
      expect(sentEmails[0]?.subject).toContain("Test Company");
      expect(sentEmails[0]?.html).toContain("SKU-001");
      expect(sentEmails[0]?.html).toContain("SKU-002");

      // 9. Verify alerts are marked as sent
      const updatedAlerts = await alertRepo.getPendingByUser(user.id);
      expect(updatedAlerts).toHaveLength(0); // No more pending alerts

      // Verify sent status in database
      const allAlerts = await db.query<Alert>(
        `SELECT * FROM alerts WHERE user_id = $1`,
        [user.id]
      );
      expect(allAlerts).toHaveLength(2);
      expect(allAlerts.every((a) => a.status === "sent")).toBe(true);
      expect(allAlerts.every((a) => a.sent_at !== null)).toBe(true);
    });

    test("should create out_of_stock alert when quantity is zero", async () => {
      // Setup tenant and user
      const tenant = await tenantRepo.create({
        bsale_client_code: "TEST-002",
        bsale_client_name: "Zero Stock Company",
        bsale_access_token: "mock-token",
      });

      const user = await userRepo.create({
        tenant_id: tenant.id,
        email: "admin@zerostock.com",
        notification_enabled: true,
        digest_frequency: "daily",
      });

      // Create threshold for variant that will be out of stock
      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 2001,
        bsale_office_id: null,
        min_quantity: 10,
        days_warning: 0,
      });

      // Mock Bsale data with zero stock
      const mockStocks: StockItem[] = [
        {
          id: 10,
          quantity: 0,
          quantityReserved: 0,
          quantityAvailable: 0, // Out of stock
          variant: { href: "/v1/variants/2001.json", id: 2001 },
          office: null,
        },
      ];

      const mockVariants = new Map<number, Variant>([
        [2001, { id: 2001, code: "OUT-001", barCode: null, description: "Out of Stock Item", product: { name: "Out of Stock Product" } }],
      ]);

      // Run sync
      const syncDeps: TenantSyncDependencies = {
        tenantRepo,
        snapshotRepo,
        createBsaleClient: () => createMockBsaleClient(mockStocks, mockVariants),
      };

      await syncTenant(tenant, syncDeps, { batchSize: 100, delayBetweenTenants: 0 });

      // Generate alerts
      const alertDeps: AlertGeneratorDependencies = {
        getThresholdsByUser: (userId: string) => thresholdRepo.getByUser(userId),
        getStockSnapshot: (tid: string, variantId: number, officeId: number | null) =>
          snapshotRepo.getByVariant(tid, variantId, officeId),
        getHistoricalSnapshots: (tid: string, variantId: number, officeId: number | null, days: number) =>
          snapshotRepo.getHistoricalSnapshots(tid, variantId, officeId, days),
        hasPendingAlert: (userId: string, variantId: number, officeId: number | null, alertType) =>
          alertRepo.hasPendingAlert(userId, variantId, officeId, alertType),
        createAlerts: (alerts) => alertRepo.createBatch(alerts),
      };

      const alertResult = await generateAlertsForUser(user.id, tenant.id, alertDeps);

      // Verify out_of_stock alert created
      expect(alertResult.alertsCreated).toBe(1);

      const alerts = await alertRepo.getPendingByUser(user.id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.alert_type).toBe("out_of_stock");
      expect(alerts[0]?.current_quantity).toBe(0);
      expect(alerts[0]?.sku).toBe("OUT-001");
    });

    test("should not duplicate alerts when run multiple times", async () => {
      // Setup
      const tenant = await tenantRepo.create({
        bsale_client_code: "TEST-003",
        bsale_client_name: "Duplicate Test",
        bsale_access_token: "mock-token",
      });

      const user = await userRepo.create({
        tenant_id: tenant.id,
        email: "test@duplicate.com",
        notification_enabled: true,
        digest_frequency: "daily",
      });

      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 3001,
        bsale_office_id: null,
        min_quantity: 50,
        days_warning: 0,
      });

      const mockStocks: StockItem[] = [
        {
          id: 20,
          quantity: 10,
          quantityReserved: 0,
          quantityAvailable: 10,
          variant: { href: "/v1/variants/3001.json", id: 3001 },
          office: null,
        },
      ];

      const mockVariants = new Map<number, Variant>([
        [3001, { id: 3001, code: "DUP-001", barCode: null, description: "Duplicate Test", product: { name: "Duplicate Test Product" } }],
      ]);

      const syncDeps: TenantSyncDependencies = {
        tenantRepo,
        snapshotRepo,
        createBsaleClient: () => createMockBsaleClient(mockStocks, mockVariants),
      };

      const alertDeps: AlertGeneratorDependencies = {
        getThresholdsByUser: (userId: string) => thresholdRepo.getByUser(userId),
        getStockSnapshot: (tid: string, variantId: number, officeId: number | null) =>
          snapshotRepo.getByVariant(tid, variantId, officeId),
        getHistoricalSnapshots: (tid: string, variantId: number, officeId: number | null, days: number) =>
          snapshotRepo.getHistoricalSnapshots(tid, variantId, officeId, days),
        hasPendingAlert: (userId: string, variantId: number, officeId: number | null, alertType) =>
          alertRepo.hasPendingAlert(userId, variantId, officeId, alertType),
        createAlerts: (alerts) => alertRepo.createBatch(alerts),
      };

      // Run sync and alert generation twice
      await syncTenant(tenant, syncDeps, { batchSize: 100, delayBetweenTenants: 0 });
      const result1 = await generateAlertsForUser(user.id, tenant.id, alertDeps);

      await syncTenant(tenant, syncDeps, { batchSize: 100, delayBetweenTenants: 0 });
      const result2 = await generateAlertsForUser(user.id, tenant.id, alertDeps);

      // First run should create alert
      expect(result1.alertsCreated).toBe(1);

      // Second run should NOT create duplicate
      expect(result2.alertsCreated).toBe(0);

      // Only one alert should exist
      const alerts = await alertRepo.getPendingByUser(user.id);
      expect(alerts).toHaveLength(1);
    });

    test("should use notification_email when set", async () => {
      const tenant = await tenantRepo.create({
        bsale_client_code: "TEST-004",
        bsale_client_name: "Notification Email Test",
        bsale_access_token: "mock-token",
      });

      const user = await userRepo.create({
        tenant_id: tenant.id,
        email: "primary@test.com",
        notification_enabled: true,
        notification_email: "alerts@test.com", // Different notification email
        digest_frequency: "daily",
      });

      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 4001,
        bsale_office_id: null,
        min_quantity: 100,
        days_warning: 0,
      });

      const mockStocks: StockItem[] = [
        {
          id: 30,
          quantity: 5,
          quantityReserved: 0,
          quantityAvailable: 5,
          variant: { href: "/v1/variants/4001.json", id: 4001 },
          office: null,
        },
      ];

      const mockVariants = new Map<number, Variant>([
        [4001, { id: 4001, code: "EMAIL-001", barCode: null, description: "Email Test", product: { name: "Email Test Product" } }],
      ]);

      // Run sync and generate alerts
      const syncDeps: TenantSyncDependencies = {
        tenantRepo,
        snapshotRepo,
        createBsaleClient: () => createMockBsaleClient(mockStocks, mockVariants),
      };

      await syncTenant(tenant, syncDeps, { batchSize: 100, delayBetweenTenants: 0 });

      const alertDeps: AlertGeneratorDependencies = {
        getThresholdsByUser: (userId: string) => thresholdRepo.getByUser(userId),
        getStockSnapshot: (tid: string, variantId: number, officeId: number | null) =>
          snapshotRepo.getByVariant(tid, variantId, officeId),
        getHistoricalSnapshots: (tid: string, variantId: number, officeId: number | null, days: number) =>
          snapshotRepo.getHistoricalSnapshots(tid, variantId, officeId, days),
        hasPendingAlert: (userId: string, variantId: number, officeId: number | null, alertType) =>
          alertRepo.hasPendingAlert(userId, variantId, officeId, alertType),
        createAlerts: (alerts) => alertRepo.createBatch(alerts),
      };

      await generateAlertsForUser(user.id, tenant.id, alertDeps);

      // Run digest job
      const mockEmailClient = createMockEmailClient();
      const digestDeps: DigestJobDependencies = {
        db,
        config: createTestConfig(),
        emailClient: mockEmailClient,
      };

      await runDigestJob(digestDeps, "daily");

      // Verify email was sent to notification_email, not primary email
      const sentEmails = mockEmailClient.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]?.to).toBe("alerts@test.com");
    });

    test("should skip users with digest_frequency=none", async () => {
      const tenant = await tenantRepo.create({
        bsale_client_code: "TEST-005",
        bsale_client_name: "Digest Disabled Test",
        bsale_access_token: "mock-token",
      });

      const user = await userRepo.create({
        tenant_id: tenant.id,
        email: "nodigest@test.com",
        notification_enabled: true,
        digest_frequency: "none", // Digest disabled
      });

      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 5001,
        bsale_office_id: null,
        min_quantity: 100,
        days_warning: 0,
      });

      const mockStocks: StockItem[] = [
        {
          id: 40,
          quantity: 5,
          quantityReserved: 0,
          quantityAvailable: 5,
          variant: { href: "/v1/variants/5001.json", id: 5001 },
          office: null,
        },
      ];

      const mockVariants = new Map<number, Variant>([
        [5001, { id: 5001, code: "NODIG-001", barCode: null, description: "No Digest", product: { name: "No Digest Product" } }],
      ]);

      // Run sync and generate alerts
      const syncDeps: TenantSyncDependencies = {
        tenantRepo,
        snapshotRepo,
        createBsaleClient: () => createMockBsaleClient(mockStocks, mockVariants),
      };

      await syncTenant(tenant, syncDeps, { batchSize: 100, delayBetweenTenants: 0 });

      const alertDeps: AlertGeneratorDependencies = {
        getThresholdsByUser: (userId: string) => thresholdRepo.getByUser(userId),
        getStockSnapshot: (tid: string, variantId: number, officeId: number | null) =>
          snapshotRepo.getByVariant(tid, variantId, officeId),
        getHistoricalSnapshots: (tid: string, variantId: number, officeId: number | null, days: number) =>
          snapshotRepo.getHistoricalSnapshots(tid, variantId, officeId, days),
        hasPendingAlert: (userId: string, variantId: number, officeId: number | null, alertType) =>
          alertRepo.hasPendingAlert(userId, variantId, officeId, alertType),
        createAlerts: (alerts) => alertRepo.createBatch(alerts),
      };

      await generateAlertsForUser(user.id, tenant.id, alertDeps);

      // Verify alert was created
      const alertsBefore = await alertRepo.getPendingByUser(user.id);
      expect(alertsBefore).toHaveLength(1);

      // Run digest job
      const mockEmailClient = createMockEmailClient();
      const digestDeps: DigestJobDependencies = {
        db,
        config: createTestConfig(),
        emailClient: mockEmailClient,
      };

      const digestResult = await runDigestJob(digestDeps, "daily");

      // Verify no email was sent (user has digest_frequency=none)
      expect(digestResult.emailsSent).toBe(0);
      expect(mockEmailClient.getSentEmails()).toHaveLength(0);

      // Alert should still be pending
      const alertsAfter = await alertRepo.getPendingByUser(user.id);
      expect(alertsAfter).toHaveLength(1);
    });

    test("should handle office-specific thresholds", async () => {
      const tenant = await tenantRepo.create({
        bsale_client_code: "TEST-006",
        bsale_client_name: "Office Test",
        bsale_access_token: "mock-token",
      });

      const user = await userRepo.create({
        tenant_id: tenant.id,
        email: "office@test.com",
        notification_enabled: true,
        digest_frequency: "daily",
      });

      // Threshold for specific office
      await thresholdRepo.create({
        tenant_id: tenant.id,
        user_id: user.id,
        bsale_variant_id: 6001,
        bsale_office_id: 10, // Specific office
        min_quantity: 50,
        days_warning: 0,
      });

      const mockStocks: StockItem[] = [
        {
          id: 50,
          quantity: 20,
          quantityReserved: 0,
          quantityAvailable: 20, // Below threshold
          variant: { href: "/v1/variants/6001.json", id: 6001 },
          office: { href: "/v1/offices/10.json", id: 10 },
        },
        {
          id: 51,
          quantity: 100,
          quantityReserved: 0,
          quantityAvailable: 100, // Different office - no threshold
          variant: { href: "/v1/variants/6001.json", id: 6001 },
          office: { href: "/v1/offices/20.json", id: 20 },
        },
      ];

      const mockVariants = new Map<number, Variant>([
        [6001, { id: 6001, code: "OFFICE-001", barCode: null, description: "Office Product", product: { name: "Office Product" } }],
      ]);

      const syncDeps: TenantSyncDependencies = {
        tenantRepo,
        snapshotRepo,
        createBsaleClient: () => createMockBsaleClient(mockStocks, mockVariants),
      };

      await syncTenant(tenant, syncDeps, { batchSize: 100, delayBetweenTenants: 0 });

      const alertDeps: AlertGeneratorDependencies = {
        getThresholdsByUser: (userId: string) => thresholdRepo.getByUser(userId),
        getStockSnapshot: (tid: string, variantId: number, officeId: number | null) =>
          snapshotRepo.getByVariant(tid, variantId, officeId),
        getHistoricalSnapshots: (tid: string, variantId: number, officeId: number | null, days: number) =>
          snapshotRepo.getHistoricalSnapshots(tid, variantId, officeId, days),
        hasPendingAlert: (userId: string, variantId: number, officeId: number | null, alertType) =>
          alertRepo.hasPendingAlert(userId, variantId, officeId, alertType),
        createAlerts: (alerts) => alertRepo.createBatch(alerts),
      };

      const alertResult = await generateAlertsForUser(user.id, tenant.id, alertDeps);

      // Only one alert for office 10 (below threshold)
      expect(alertResult.alertsCreated).toBe(1);

      const alerts = await alertRepo.getPendingByUser(user.id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.bsale_office_id).toBe(10);
    });
  });
});
