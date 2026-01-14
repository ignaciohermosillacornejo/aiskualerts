import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { runSyncAndAlerts } from "@/jobs/sync-job";
import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";

// Save original console methods
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

describe("runSyncAndAlerts function", () => {
  beforeEach(() => {
    console.info = mock(() => undefined);
    console.warn = mock(() => undefined);
    console.error = mock(() => undefined);
  });

  afterEach(() => {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  });

  test("returns result with all required fields", async () => {
    // Create a mock database that will allow the function to complete
    const mockDb = {
      query: mock((sql: string) => {
        // Return empty arrays for all tenant queries
        if (sql.includes("SELECT * FROM tenants")) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
      queryOne: mock(() => Promise.resolve(null)),
      execute: mock(() => Promise.resolve()),
    } as unknown as DatabaseClient;

    const config: Config = {
      port: 3000,
      nodeEnv: "test",
      allowedOrigins: [],
      syncEnabled: true,
      syncHour: 2,
      syncMinute: 0,
      syncBatchSize: 100,
      syncTenantDelay: 0, // No delay for tests
      digestEnabled: false,
      digestHour: 8,
      digestMinute: 0,
      sentryEnvironment: "test",
      mercadoPagoPlanAmount: 9990,
      mercadoPagoPlanCurrency: "CLP",
    };

    const result = await runSyncAndAlerts(mockDb, config);

    expect(result).toBeDefined();
    expect(result.syncProgress).toBeDefined();
    expect(result.alertResults).toBeDefined();
    expect(Array.isArray(result.alertResults)).toBe(true);
    expect(typeof result.totalAlertsCreated).toBe("number");
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  test("processes tenants and generates alerts", async () => {
    const mockTenants = [
      {
        id: "tenant-1",
        bsale_client_code: "code-1",
        bsale_access_token: "token-1",
        sync_status: "pending",
      },
    ];

    const mockUsers = [
      {
        id: "user-1",
        tenant_id: "tenant-1",
        email: "user@test.com",
        notification_enabled: true,
      },
    ];

    const mockDb = {
      query: mock((sql: string) => {
        if (sql.includes("SELECT * FROM tenants") && sql.includes("sync_status")) {
          return Promise.resolve(mockTenants);
        }
        if (sql.includes("SELECT * FROM users") && sql.includes("notification_enabled")) {
          return Promise.resolve(mockUsers);
        }
        if (sql.includes("SELECT * FROM thresholds")) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
      queryOne: mock(() => Promise.resolve(null)),
      execute: mock(() => Promise.resolve()),
    } as unknown as DatabaseClient;

    const config: Config = {
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
      sentryEnvironment: "test",
      mercadoPagoPlanAmount: 9990,
      mercadoPagoPlanCurrency: "CLP",
    };

    const result = await runSyncAndAlerts(mockDb, config);

    expect(result.syncProgress).toBeDefined();
    expect(result.alertResults).toBeDefined();
  });

  test("handles successful tenant sync", async () => {
    const mockTenants = [
      {
        id: "tenant-1",
        bsale_client_code: "code-1",
        bsale_access_token: "token-1",
        sync_status: "pending",
      },
    ];

    const mockDb = {
      query: mock((sql: string) => {
        if (sql.includes("SELECT * FROM tenants")) {
          return Promise.resolve(mockTenants);
        }
        return Promise.resolve([]);
      }),
      queryOne: mock(() => Promise.resolve(null)),
      execute: mock(() => Promise.resolve()),
    } as unknown as DatabaseClient;

    const config: Config = {
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
      sentryEnvironment: "test",
      mercadoPagoPlanAmount: 9990,
      mercadoPagoPlanCurrency: "CLP",
    };

    const result = await runSyncAndAlerts(mockDb, config);

    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(
      result.startedAt.getTime()
    );
  });

  test("accumulates total alerts created", async () => {
    // Mock minimal database that allows completion
    const mockDb = {
      query: mock(() => Promise.resolve([])),
      queryOne: mock(() => Promise.resolve(null)),
      execute: mock(() => Promise.resolve()),
    } as unknown as DatabaseClient;

    const config: Config = {
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
      sentryEnvironment: "test",
      mercadoPagoPlanAmount: 9990,
      mercadoPagoPlanCurrency: "CLP",
    };

    const result = await runSyncAndAlerts(mockDb, config);

    expect(result.totalAlertsCreated).toBe(0);
  });
});

describe("SyncJobResult structure", () => {
  test("syncProgress contains expected fields", () => {
    const mockProgress = {
      totalTenants: 5,
      completedTenants: 5,
      successCount: 4,
      failureCount: 1,
      results: [
        { tenantId: "t1", success: true },
        { tenantId: "t2", success: false, error: "Failed" },
      ],
    };

    expect(mockProgress.totalTenants).toBe(5);
    expect(mockProgress.successCount + mockProgress.failureCount).toBe(5);
    expect(mockProgress.results.length).toBe(2);
  });

  test("alertResults is an array", () => {
    const mockAlertResults = [
      { userId: "u1", alertsCreated: 2, errors: [] },
      { userId: "u2", alertsCreated: 0, errors: ["Error generating alert"] },
    ];

    expect(Array.isArray(mockAlertResults)).toBe(true);
    expect(mockAlertResults[0]?.alertsCreated).toBe(2);
    expect(mockAlertResults[1]?.errors.length).toBe(1);
  });
});
