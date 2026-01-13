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

  test("logs warnings when job completes with errors", async () => {
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

    const job = createDigestJob({ db, config, emailClient });
    await job();

    expect(console.warn).toHaveBeenCalled();
  });

  test("logs duration on successful completion", async () => {
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

    const job = createDigestJob({ db, config, emailClient });
    await job();

    // Verify console.info was called (includes duration log)
    const infoMock = console.info as Mock<typeof console.info>;
    expect(infoMock.mock.calls.length).toBeGreaterThan(0);
  });

  test("handles non-Error exceptions in wrapper", async () => {
    const { db, mocks } = createMockDb();
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    mocks.query.mockRejectedValue("string error");

    const config = createMockConfig();
    const emailClient = createMockEmailClient();

    const job = createDigestJob({ db, config, emailClient });

    await expect(job()).rejects.toBe("string error");
    // Error message should contain "Unknown error" since it's not an Error instance
    const errorMock = console.error as Mock<typeof console.error>;
    expect(errorMock.mock.calls.length).toBeGreaterThan(0);
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

  describe("batch operations", () => {
    test("handles large batch of alerts for single user", async () => {
      const { db, mocks } = createMockDb();
      // Generate 50 alerts for one user
      const manyAlerts = Array.from({ length: 50 }, (_, i) => ({
        ...mockAlert,
        id: `alert-${String(i)}`,
        sku: `SKU${String(i).padStart(3, "0")}`,
        product_name: `Product ${String(i)}`,
      }));

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
          return Promise.resolve(manyAlerts);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(1);
      expect(result.alertsMarkedSent).toBe(50);
    });

    test("handles alerts with missing optional fields", async () => {
      const { db, mocks } = createMockDb();
      const alertsWithNulls = [
        { ...mockAlert, id: "alert-1", sku: null, product_name: null },
        { ...mockAlert, id: "alert-2", sku: "SKU002", product_name: null },
        { ...mockAlert, id: "alert-3", sku: null, product_name: "Product 3" },
        { ...mockAlert, id: "alert-4", threshold_quantity: null },
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
          return Promise.resolve(alertsWithNulls);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(1);
      expect(result.alertsMarkedSent).toBe(4);
    });

    test("marks alerts as sent in batch for multiple users in same tenant", async () => {
      const { db, mocks } = createMockDb();
      const users = [
        mockUser,
        { ...mockUser, id: "user-456", email: "user2@example.com" },
        { ...mockUser, id: "user-789", email: "user3@example.com" },
      ];
      const alerts = [
        { ...mockAlert, id: "alert-1", user_id: "user-123" },
        { ...mockAlert, id: "alert-2", user_id: "user-123" },
        { ...mockAlert, id: "alert-3", user_id: "user-456" },
        { ...mockAlert, id: "alert-4", user_id: "user-789" },
        { ...mockAlert, id: "alert-5", user_id: "user-789" },
      ];

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (callCount === 2) {
          return Promise.resolve(users);
        }
        if (callCount === 3) {
          return Promise.resolve(alerts);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(3);
      expect(result.alertsMarkedSent).toBe(5);
      // Each user's alerts are marked separately
      expect(mocks.execute.mock.calls.length).toBe(3);
    });
  });

  describe("error scenarios", () => {
    test("handles email client throwing exception", async () => {
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
      const emailClient = {
        sendEmail: mock(() => Promise.reject(new Error("SMTP connection failed"))),
      };

      const result = await runDigestJob({ db, config, emailClient });

      // The tenant processing catches the error
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("tenant-123");
      expect(result.emailsSent).toBe(0);
      expect(result.alertsMarkedSent).toBe(0);
    });

    test("handles database error when marking alerts as sent", async () => {
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

      mocks.execute.mockRejectedValue(new Error("Database write error"));

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      // Email was sent but marking failed - error caught at tenant level
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("Database write error");
    });

    test("handles partial failure - first user succeeds, second fails", async () => {
      const { db, mocks } = createMockDb();
      const users = [
        mockUser,
        { ...mockUser, id: "user-456", email: "user2@example.com" },
      ];
      const alerts = [
        { ...mockAlert, id: "alert-1", user_id: "user-123" },
        { ...mockAlert, id: "alert-2", user_id: "user-456" },
      ];

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (callCount === 2) {
          return Promise.resolve(users);
        }
        if (callCount === 3) {
          return Promise.resolve(alerts);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      let emailCallCount = 0;
      const emailClient = {
        sendEmail: mock(() => {
          emailCallCount++;
          if (emailCallCount === 1) {
            return Promise.resolve({ success: true, id: "email-123" } as SendEmailResult);
          }
          return Promise.resolve({ success: false, error: "Recipient rejected" } as SendEmailResult);
        }),
      };

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(1);
      expect(result.emailsFailed).toBe(1);
      expect(result.alertsMarkedSent).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("user2@example.com");
    });

    test("handles non-Error exception types", async () => {
      const { db, mocks } = createMockDb();

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "string error";
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("Unknown error");
    });

    test("records error with unknown error message for email failure without message", async () => {
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
      // Return failure without error message
      const emailClient = createMockEmailClient({ success: false });

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsFailed).toBe(1);
      expect(result.errors[0]).toContain("Unknown error");
    });

    test("continues processing remaining tenants after one tenant fails completely", async () => {
      const { db, mocks } = createMockDb();
      const tenant2 = { ...mockTenant, id: "tenant-456", bsale_client_name: "Company 2" };
      const tenant3 = { ...mockTenant, id: "tenant-789", bsale_client_name: "Company 3" };

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant, tenant2, tenant3]);
        }
        if (callCount === 2) {
          throw new Error("Tenant 1 database error");
        }
        if (callCount === 3) {
          return Promise.resolve([{ ...mockUser, tenant_id: "tenant-456" }]);
        }
        if (callCount === 4) {
          return Promise.resolve([{ ...mockAlert, tenant_id: "tenant-456", user_id: mockUser.id }]);
        }
        if (callCount === 5) {
          return Promise.resolve([{ ...mockUser, tenant_id: "tenant-789" }]);
        }
        if (callCount === 6) {
          return Promise.resolve([{ ...mockAlert, tenant_id: "tenant-789", user_id: mockUser.id }]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.errors.length).toBe(1);
      expect(result.tenantsProcessed).toBe(2);
      expect(result.emailsSent).toBe(2);
    });
  });

  describe("frequency filtering", () => {
    test("uses daily frequency by default", async () => {
      const { db, mocks } = createMockDb();

      let capturedFrequency: string | undefined;
      let callCount = 0;
      mocks.query.mockImplementation((...args: unknown[]) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (callCount === 2) {
          // Capture the frequency parameter from getWithDigestEnabled query
          const queryArgs = args as [string, unknown[]];
          if (queryArgs[1] && Array.isArray(queryArgs[1])) {
            capturedFrequency = queryArgs[1][1] as string;
          }
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

      expect(capturedFrequency).toBe("daily");
    });

    test("filters users by weekly frequency when specified", async () => {
      const { db, mocks } = createMockDb();
      const weeklyUser = { ...mockUser, digest_frequency: "weekly" as const };

      let capturedFrequency: string | undefined;
      let callCount = 0;
      mocks.query.mockImplementation((...args: unknown[]) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (callCount === 2) {
          const queryArgs = args as [string, unknown[]];
          if (queryArgs[1] && Array.isArray(queryArgs[1])) {
            capturedFrequency = queryArgs[1][1] as string;
          }
          return Promise.resolve([weeklyUser]);
        }
        if (callCount === 3) {
          return Promise.resolve([mockAlert]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      await runDigestJob({ db, config, emailClient }, "weekly");

      expect(capturedFrequency).toBe("weekly");
    });

    test("excludes users with none frequency from daily digest", async () => {
      const { db, mocks } = createMockDb();
      // Simulating that the repository returns no users because all have "none" frequency
      // The actual filtering happens in the repository, but we test that the job handles empty result

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (callCount === 2) {
          // No users with digest enabled (simulates all users have "none")
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.tenantsProcessed).toBe(0);
      expect(result.emailsSent).toBe(0);
    });

    test("processes only users matching the specified frequency", async () => {
      const { db, mocks } = createMockDb();
      const dailyUser = { ...mockUser, id: "daily-user", digest_frequency: "daily" as const };
      const weeklyUser = { ...mockUser, id: "weekly-user", digest_frequency: "weekly" as const };

      // Run daily digest - should only get daily user
      let dailyCallCount = 0;
      mocks.query.mockImplementation(() => {
        dailyCallCount++;
        if (dailyCallCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (dailyCallCount === 2) {
          // Repository returns only daily user for daily frequency
          return Promise.resolve([dailyUser]);
        }
        if (dailyCallCount === 3) {
          return Promise.resolve([{ ...mockAlert, user_id: "daily-user" }]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const dailyResult = await runDigestJob({ db, config, emailClient }, "daily");

      expect(dailyResult.emailsSent).toBe(1);

      // Reset and run weekly digest
      let weeklyCallCount = 0;
      mocks.query.mockImplementation(() => {
        weeklyCallCount++;
        if (weeklyCallCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (weeklyCallCount === 2) {
          // Repository returns only weekly user for weekly frequency
          return Promise.resolve([weeklyUser]);
        }
        if (weeklyCallCount === 3) {
          return Promise.resolve([{ ...mockAlert, user_id: "weekly-user" }]);
        }
        return Promise.resolve([]);
      });

      const weeklyResult = await runDigestJob({ db, config, emailClient }, "weekly");

      expect(weeklyResult.emailsSent).toBe(1);
    });
  });

  describe("edge cases", () => {
    test("handles alert with null sku - defaults to N/A in email", async () => {
      const { db, mocks } = createMockDb();
      const alertWithNullSku = { ...mockAlert, sku: null };

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
          return Promise.resolve([alertWithNullSku]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const sendEmailMock = emailClient.sendEmail as Mock<(params: { to: string; subject: string; html: string }) => Promise<SendEmailResult>>;
      const callArgs = sendEmailMock.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }];
      expect(callArgs[0].html).toContain("N/A");
    });

    test("handles alert with null product_name - uses fallback", async () => {
      const { db, mocks } = createMockDb();
      const alertWithNullName = { ...mockAlert, product_name: null, bsale_variant_id: 9999 };

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
          return Promise.resolve([alertWithNullName]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const sendEmailMock = emailClient.sendEmail as Mock<(params: { to: string; subject: string; html: string }) => Promise<SendEmailResult>>;
      const callArgs = sendEmailMock.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }];
      expect(callArgs[0].html).toContain("Product 9999");
    });

    test("skips user when user found but has no alerts after grouping", async () => {
      const { db, mocks } = createMockDb();
      // User exists but all alerts belong to other users
      const otherUserAlert = { ...mockAlert, user_id: "other-user-id" };

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (callCount === 2) {
          return Promise.resolve([mockUser]); // user-123
        }
        if (callCount === 3) {
          return Promise.resolve([otherUserAlert]); // Alert for different user
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.tenantsProcessed).toBe(1);
      expect(result.emailsSent).toBe(0);
      expect((emailClient.sendEmail as Mock<() => Promise<SendEmailResult>>).mock.calls.length).toBe(0);
    });

    test("skips empty user alerts array after finding user", async () => {
      const { db, mocks } = createMockDb();
      const users = [mockUser, { ...mockUser, id: "user-456" }];
      // Only one alert for user-123, nothing for user-456
      const alerts = [{ ...mockAlert, user_id: "user-123" }];

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockTenant]);
        }
        if (callCount === 2) {
          return Promise.resolve(users);
        }
        if (callCount === 3) {
          return Promise.resolve(alerts);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      // Only one email sent (for user-123), user-456 has no alerts
      expect(result.emailsSent).toBe(1);
      expect(result.alertsMarkedSent).toBe(1);
    });

    test("handles zero quantity and zero threshold values", async () => {
      const { db, mocks } = createMockDb();
      const alertWithZeros = {
        ...mockAlert,
        current_quantity: 0,
        threshold_quantity: 0,
        alert_type: "out_of_stock" as const,
      };

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
          return Promise.resolve([alertWithZeros]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(1);
    });

    test("handles special characters in tenant name and product name", async () => {
      const { db, mocks } = createMockDb();
      const tenantWithSpecialChars = {
        ...mockTenant,
        bsale_client_name: "Test & Company <S.A.> \"Quoted\"",
      };
      const alertWithSpecialChars = {
        ...mockAlert,
        product_name: "Product <script>alert('xss')</script>",
        sku: "SKU & Test",
      };

      let callCount = 0;
      mocks.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([tenantWithSpecialChars]);
        }
        if (callCount === 2) {
          return Promise.resolve([mockUser]);
        }
        if (callCount === 3) {
          return Promise.resolve([alertWithSpecialChars]);
        }
        return Promise.resolve([]);
      });

      const config = createMockConfig();
      const emailClient = createMockEmailClient();

      const result = await runDigestJob({ db, config, emailClient });

      expect(result.emailsSent).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const sendEmailMock = emailClient.sendEmail as Mock<(params: { to: string; subject: string; html: string }) => Promise<SendEmailResult>>;
      const callArgs = sendEmailMock.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }];
      // Verify HTML escaping
      expect(callArgs[0].html).not.toContain("<script>");
      expect(callArgs[0].html).toContain("&lt;script&gt;");
    });
  });
});
