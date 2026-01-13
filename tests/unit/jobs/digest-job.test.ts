/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, mock, beforeEach, afterEach, type Mock } from "bun:test";
import {
  createDigestJob,
  runDigestJob,
} from "@/jobs/digest-job";
import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import type { EmailClient, SendEmailResult } from "@/email/resend-client";
import type { Tenant, User, Alert } from "@/db/repositories/types";

interface MockDb {
  query: Mock<() => Promise<unknown[]>>;
  queryOne: Mock<() => Promise<unknown>>;
  execute: Mock<() => Promise<void>>;
}

function createMockDb(): { db: DatabaseClient; mocks: MockDb } {
  const mocks: MockDb = {
    query: mock(() => Promise.resolve([])),
    queryOne: mock(() => Promise.resolve(null)),
    execute: mock(() => Promise.resolve()),
  };
  return {
    db: mocks as unknown as DatabaseClient,
    mocks,
  };
}

function createMockConfig(): Config {
  return {
    port: 3000,
    nodeEnv: "test",
    syncEnabled: false,
    syncHour: 2,
    syncMinute: 0,
    syncBatchSize: 100,
    syncTenantDelay: 5000,
    resendApiKey: "re_test_key",
    notificationFromEmail: "test@aiskualerts.com",
    sentryEnvironment: "test",
  };
}

function createMockEmailClient(sendResult: SendEmailResult = { success: true, id: "email-123" }): EmailClient {
  return {
    sendEmail: mock(() => Promise.resolve(sendResult)),
  };
}

const mockTenant: Tenant = {
  id: "tenant-123",
  bsale_client_code: "12345678-9",
  bsale_client_name: "Test Company SpA",
  bsale_access_token: "token123",
  sync_status: "success",
  last_sync_at: new Date("2024-01-01"),
  stripe_customer_id: null,
  is_paid: false,
  created_at: new Date("2024-01-01"),
  updated_at: new Date("2024-01-01"),
};

const mockUser: User = {
  id: "user-123",
  tenant_id: "tenant-123",
  email: "user@example.com",
  name: "Test User",
  notification_enabled: true,
  notification_email: null,
  digest_frequency: "daily",
  created_at: new Date("2024-01-01"),
};

const mockAlert: Alert = {
  id: "alert-123",
  tenant_id: "tenant-123",
  user_id: "user-123",
  bsale_variant_id: 1001,
  bsale_office_id: null,
  sku: "SKU001",
  product_name: "Product One",
  alert_type: "low_stock",
  current_quantity: 5,
  threshold_quantity: 10,
  days_to_stockout: null,
  status: "pending",
  sent_at: null,
  created_at: new Date("2024-01-01"),
};

/* eslint-disable @typescript-eslint/no-empty-function */
describe("createDigestJob", () => {
  let originalConsole: { info: typeof console.info; warn: typeof console.warn; error: typeof console.error };

  beforeEach(() => {
    originalConsole = {
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    console.info = mock(() => {});
    console.warn = mock(() => {});
    console.error = mock(() => {});
  });

  afterEach(() => {
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  test("returns a function", () => {
    const { db } = createMockDb();
    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const job = createDigestJob({ db, config, emailClient });

    expect(typeof job).toBe("function");
  });

  test("logs job start and completion", async () => {
    const { db, mocks } = createMockDb();
    mocks.query.mockResolvedValue([]);

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const job = createDigestJob({ db, config, emailClient });
    await job();

    expect(console.info).toHaveBeenCalled();
  });

  test("logs errors and rethrows on failure", async () => {
    const { db, mocks } = createMockDb();
    mocks.query.mockRejectedValue(new Error("Database error"));

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const job = createDigestJob({ db, config, emailClient });

    await expect(job()).rejects.toThrow("Database error");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("runDigestJob", () => {
  let originalConsole: { info: typeof console.info; warn: typeof console.warn; error: typeof console.error };

  beforeEach(() => {
    originalConsole = {
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    console.info = mock(() => {});
    console.warn = mock(() => {});
    console.error = mock(() => {});
  });

  afterEach(() => {
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  test("returns result with zero counts when no tenants", async () => {
    const { db, mocks } = createMockDb();
    mocks.query.mockResolvedValue([]);

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.tenantsProcessed).toBe(0);
    expect(result.emailsSent).toBe(0);
    expect(result.emailsFailed).toBe(0);
    expect(result.alertsMarkedSent).toBe(0);
    expect(result.errors).toEqual([]);
  });

  test("skips tenants with no users with digest enabled", async () => {
    const { db, mocks } = createMockDb();

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // getActiveTenants
        return Promise.resolve([mockTenant]);
      }
      // getWithDigestEnabled - no users
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.tenantsProcessed).toBe(0);
    expect(result.emailsSent).toBe(0);
  });

  test("skips tenants with no pending alerts", async () => {
    const { db, mocks } = createMockDb();

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // getActiveTenants
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        // getWithDigestEnabled
        return Promise.resolve([mockUser]);
      }
      // getPendingByTenant - no alerts
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.tenantsProcessed).toBe(0);
    expect(result.emailsSent).toBe(0);
  });

  test("sends email for tenant with pending alerts", async () => {
    const { db, mocks } = createMockDb();

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // getActiveTenants
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        // getWithDigestEnabled
        return Promise.resolve([mockUser]);
      }
      if (callCount === 3) {
        // getPendingByTenant
        return Promise.resolve([mockAlert]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.tenantsProcessed).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(result.alertsMarkedSent).toBe(1);
    expect((emailClient.sendEmail as Mock<() => Promise<SendEmailResult>>).mock.calls.length).toBe(1);
  });

  test("uses notification_email when available", async () => {
    const { db, mocks } = createMockDb();
    const userWithNotificationEmail = {
      ...mockUser,
      notification_email: "alerts@example.com",
    };

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([userWithNotificationEmail]);
      }
      if (callCount === 3) {
        return Promise.resolve([mockAlert]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    await runDigestJob({ db, config, emailClient });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const sendEmailMock = emailClient.sendEmail as Mock<(params: { to: string; subject: string; html: string }) => Promise<SendEmailResult>>;
    expect(sendEmailMock.mock.calls.length).toBe(1);
    const callArgs = sendEmailMock.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }];
    expect(callArgs[0].to).toBe("alerts@example.com");
  });

  test("falls back to user email when notification_email is null", async () => {
    const { db, mocks } = createMockDb();

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser]);
      }
      if (callCount === 3) {
        return Promise.resolve([mockAlert]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    await runDigestJob({ db, config, emailClient });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const sendEmailMock = emailClient.sendEmail as Mock<(params: { to: string; subject: string; html: string }) => Promise<SendEmailResult>>;
    expect(sendEmailMock.mock.calls.length).toBe(1);
    const callArgs = sendEmailMock.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }];
    expect(callArgs[0].to).toBe("user@example.com");
  });

  test("marks alerts as sent after successful email", async () => {
    const { db, mocks } = createMockDb();

    let queryCallCount = 0;
    mocks.query.mockImplementation(() => {
      queryCallCount++;
      if (queryCallCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (queryCallCount === 2) {
        return Promise.resolve([mockUser]);
      }
      if (queryCallCount === 3) {
        return Promise.resolve([mockAlert]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.alertsMarkedSent).toBe(1);
    expect(mocks.execute.mock.calls.length).toBeGreaterThan(0);
  });

  test("handles email send failure", async () => {
    const { db, mocks } = createMockDb();

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser]);
      }
      if (callCount === 3) {
        return Promise.resolve([mockAlert]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient({ success: false, error: "Send failed" });

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.emailsSent).toBe(0);
    expect(result.emailsFailed).toBe(1);
    expect(result.alertsMarkedSent).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Send failed");
  });

  test("handles multiple tenants", async () => {
    const { db, mocks } = createMockDb();
    const tenant2 = { ...mockTenant, id: "tenant-456", bsale_client_name: "Company 2" };
    const user2 = { ...mockUser, id: "user-456", tenant_id: "tenant-456" };
    const alert2 = { ...mockAlert, id: "alert-456", tenant_id: "tenant-456", user_id: "user-456" };

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      // Query order:
      // 1. getActiveTenants -> [tenant1, tenant2]
      // 2. getWithDigestEnabled(tenant1) -> [user1]
      // 3. getPendingByTenant(tenant1) -> [alert1]
      // 4. getWithDigestEnabled(tenant2) -> [user2]
      // 5. getPendingByTenant(tenant2) -> [alert2]
      if (callCount === 1) {
        return Promise.resolve([mockTenant, tenant2]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser]);
      }
      if (callCount === 3) {
        return Promise.resolve([mockAlert]);
      }
      if (callCount === 4) {
        return Promise.resolve([user2]);
      }
      if (callCount === 5) {
        return Promise.resolve([alert2]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.tenantsProcessed).toBe(2);
    expect(result.emailsSent).toBe(2);
  });

  test("handles multiple users per tenant", async () => {
    const { db, mocks } = createMockDb();
    const user2 = { ...mockUser, id: "user-456", email: "user2@example.com" };
    const alert2 = { ...mockAlert, id: "alert-456", user_id: "user-456" };

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser, user2]);
      }
      if (callCount === 3) {
        return Promise.resolve([mockAlert, alert2]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.tenantsProcessed).toBe(1);
    expect(result.emailsSent).toBe(2);
    expect(result.alertsMarkedSent).toBe(2);
  });

  test("groups alerts by user correctly", async () => {
    const { db, mocks } = createMockDb();
    const user2 = { ...mockUser, id: "user-456", email: "user2@example.com" };
    const alerts = [
      { ...mockAlert, id: "alert-1", user_id: "user-123" },
      { ...mockAlert, id: "alert-2", user_id: "user-123" },
      { ...mockAlert, id: "alert-3", user_id: "user-456" },
    ];

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser, user2]);
      }
      if (callCount === 3) {
        return Promise.resolve(alerts);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.emailsSent).toBe(2);
    expect(result.alertsMarkedSent).toBe(3);
  });

  test("skips alerts for users not in digest list", async () => {
    const { db, mocks } = createMockDb();
    // Alert is for user-456 but only user-123 has digest enabled
    const alertForOtherUser = { ...mockAlert, id: "alert-1", user_id: "user-456" };

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser]); // Only user-123
      }
      if (callCount === 3) {
        return Promise.resolve([alertForOtherUser]); // Alert for user-456
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    // Tenant is processed but no emails sent because alert doesn't belong to user with digest
    expect(result.tenantsProcessed).toBe(1);
    expect(result.emailsSent).toBe(0);
  });

  test("handles tenant processing error gracefully", async () => {
    const { db, mocks } = createMockDb();
    const tenant2 = { ...mockTenant, id: "tenant-456", bsale_client_name: "Company 2" };

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant, tenant2]);
      }
      if (callCount === 2) {
        // First tenant throws error
        throw new Error("Database error");
      }
      if (callCount === 3) {
        // Second tenant works
        return Promise.resolve([{ ...mockUser, tenant_id: "tenant-456" }]);
      }
      if (callCount === 4) {
        return Promise.resolve([{ ...mockAlert, tenant_id: "tenant-456", user_id: mockUser.id }]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("tenant-123");
    expect(result.tenantsProcessed).toBe(1);
    expect(result.emailsSent).toBe(1);
  });

  test("runs with weekly frequency", async () => {
    const { db, mocks } = createMockDb();
    const weeklyUser = { ...mockUser, digest_frequency: "weekly" as const };

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([weeklyUser]);
      }
      if (callCount === 3) {
        return Promise.resolve([mockAlert]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient }, "weekly");

    expect(result.emailsSent).toBe(1);
  });

  test("includes correct email subject with tenant name", async () => {
    const { db, mocks } = createMockDb();

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser]);
      }
      if (callCount === 3) {
        return Promise.resolve([mockAlert]);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    await runDigestJob({ db, config, emailClient });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const sendEmailMock = emailClient.sendEmail as Mock<(params: { to: string; subject: string; html: string }) => Promise<SendEmailResult>>;
    const callArgs = sendEmailMock.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }];
    expect(callArgs[0].subject).toContain("Test Company SpA");
    expect(callArgs[0].subject).toContain("Resumen de Alertas");
  });

  test("returns timestamps in result", async () => {
    const { db, mocks } = createMockDb();
    mocks.query.mockResolvedValue([]);

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const before = new Date();
    const result = await runDigestJob({ db, config, emailClient });
    const after = new Date();

    expect(result.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
  });

  test("handles all alert types in digest", async () => {
    const { db, mocks } = createMockDb();
    const alerts = [
      { ...mockAlert, id: "alert-1", alert_type: "low_stock" as const },
      { ...mockAlert, id: "alert-2", alert_type: "out_of_stock" as const },
      { ...mockAlert, id: "alert-3", alert_type: "low_velocity" as const },
    ];

    let callCount = 0;
    mocks.query.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([mockTenant]);
      }
      if (callCount === 2) {
        return Promise.resolve([mockUser]);
      }
      if (callCount === 3) {
        return Promise.resolve(alerts);
      }
      return Promise.resolve([]);
    });

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const result = await runDigestJob({ db, config, emailClient });

    expect(result.alertsMarkedSent).toBe(3);
    expect(result.emailsSent).toBe(1);
  });
});
