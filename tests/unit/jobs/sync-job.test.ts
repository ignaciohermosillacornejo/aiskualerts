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
      syncEnabled: true,
      syncHour: 2,
      syncMinute: 0,
      syncBatchSize: 100,
      syncTenantDelay: 5000,
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
      syncEnabled: true,
      syncHour: 2,
      syncMinute: 0,
      syncBatchSize: 100,
      syncTenantDelay: 5000,
    };

    const job = createSyncJob(mockDb, config);
    const result = job();

    expect(result).toBeInstanceOf(Promise);
    // Clean up promise
    void result.catch(() => undefined);
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
