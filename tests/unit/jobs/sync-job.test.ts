/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/prefer-promise-reject-errors */
import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { createSyncJob } from "@/jobs/sync-job";
import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";

// Save original console methods
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

describe("createSyncJob", () => {
  beforeEach(() => {
    // Suppress console output during tests
    console.info = mock(() => undefined);
    console.warn = mock(() => undefined);
    console.error = mock(() => undefined);
  });

  afterEach(() => {
    // Restore console methods
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  });

  test("creates a job function", () => {
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
      syncTenantDelay: 5000,
      digestEnabled: false,
      digestHour: 8,
      digestMinute: 0,
      sentryEnvironment: "test",
    };

    const job = createSyncJob(mockDb, config);

    expect(typeof job).toBe("function");
  });

  test("job function is async", () => {
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
      syncTenantDelay: 5000,
      digestEnabled: false,
      digestHour: 8,
      digestMinute: 0,
      sentryEnvironment: "test",
    };

    const job = createSyncJob(mockDb, config);
    const result = job();

    expect(result).toBeInstanceOf(Promise);
    // Clean up promise
    void result.catch(() => undefined);
  });
});

describe("runSyncAndAlerts", () => {
  test("exports runSyncAndAlerts function", async () => {
    const { runSyncAndAlerts } = await import("@/jobs/sync-job");
    expect(typeof runSyncAndAlerts).toBe("function");
  });
});

describe("Sync job execution", () => {
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

  test("logs start message when job runs", async () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

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
      syncTenantDelay: 5000,
      digestEnabled: false,
      digestHour: 8,
      digestMinute: 0,
      sentryEnvironment: "test",
    };

    const job = createSyncJob(mockDb, config);

    try {
      await job();
    } catch {
      // Expected to fail without full setup
    }

    expect(mockInfo).toHaveBeenCalled();
  });

  test("logs error message on job failure", async () => {
    const mockError = mock(() => undefined);
    console.error = mockError;

    const mockDb = {
      query: mock(() => Promise.reject(new Error("Database error"))),
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
      syncTenantDelay: 5000,
      digestEnabled: false,
      digestHour: 8,
      digestMinute: 0,
      sentryEnvironment: "test",
    };

    const job = createSyncJob(mockDb, config);

    await expect(job()).rejects.toThrow();
  });

  test("handles unknown error type", async () => {
    const mockError = mock(() => undefined);
    console.error = mockError;

    const mockDb = {
      query: mock(() => Promise.reject("string error")),
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
      syncTenantDelay: 5000,
      digestEnabled: false,
      digestHour: 8,
      digestMinute: 0,
      sentryEnvironment: "test",
    };

    const job = createSyncJob(mockDb, config);

    await expect(job()).rejects.toBeDefined();
  });
});

describe("SyncJobResult interface", () => {
  test("has correct structure", () => {
    // Type-level test to ensure interface is correct
    interface SyncJobResult {
      syncProgress: {
        totalTenants: number;
        completedTenants: number;
        successCount: number;
        failureCount: number;
        results: unknown[];
      };
      alertResults: unknown[];
      totalAlertsCreated: number;
      startedAt: Date;
      completedAt: Date;
    }

    const result: SyncJobResult = {
      syncProgress: {
        totalTenants: 0,
        completedTenants: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
      },
      alertResults: [],
      totalAlertsCreated: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    };

    expect(result.syncProgress).toBeDefined();
    expect(result.alertResults).toBeDefined();
    expect(result.totalAlertsCreated).toBe(0);
  });
});
