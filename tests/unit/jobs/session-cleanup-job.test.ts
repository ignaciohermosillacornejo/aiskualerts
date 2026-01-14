/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/prefer-promise-reject-errors */
import { test, expect, describe, mock } from "bun:test";
import {
  runSessionCleanup,
  createSessionCleanupScheduler,
  type SessionCleanupResult,
} from "@/jobs/session-cleanup-job";
import type { SessionRepository } from "@/db/repositories/session";

describe("runSessionCleanup", () => {

  test("returns cleanup result with deleted count", async () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(5)),
    } as unknown as SessionRepository;

    const result = await runSessionCleanup(mockSessionRepo);

    expect(result.deletedCount).toBe(5);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(
      result.startedAt.getTime()
    );
  });

  test("completes successfully when sessions are deleted", async () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(3)),
    } as unknown as SessionRepository;

    const result = await runSessionCleanup(mockSessionRepo);

    expect(result.deletedCount).toBe(3);
  });

  test("completes successfully when no sessions are deleted", async () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const result = await runSessionCleanup(mockSessionRepo);

    expect(result.deletedCount).toBe(0);
  });

  test("returns zero count when no sessions expired", async () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const result = await runSessionCleanup(mockSessionRepo);

    expect(result.deletedCount).toBe(0);
  });

  test("propagates errors from repository", async () => {
    const mockSessionRepo = {
      deleteExpired: mock(() =>
        Promise.reject(new Error("Database connection failed"))
      ),
    } as unknown as SessionRepository;

    await expect(runSessionCleanup(mockSessionRepo)).rejects.toThrow(
      "Database connection failed"
    );
  });
});

describe("createSessionCleanupScheduler", () => {

  test("creates scheduler with start, stop, and runNow methods", () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo);

    expect(typeof scheduler.start).toBe("function");
    expect(typeof scheduler.stop).toBe("function");
    expect(typeof scheduler.runNow).toBe("function");
  });

  test("runNow executes cleanup immediately", async () => {
    const mockDeleteExpired = mock(() => Promise.resolve(2));
    const mockSessionRepo = {
      deleteExpired: mockDeleteExpired,
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    const result = await scheduler.runNow();

    expect(mockDeleteExpired).toHaveBeenCalled();
    expect(result.deletedCount).toBe(2);
  });

  test("start returns without error", () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      intervalMs: 60000,
      runOnStart: false,
    });

    // Should not throw
    expect(() => scheduler.start()).not.toThrow();

    scheduler.stop();
  });

  test("start runs cleanup immediately when runOnStart is true", async () => {
    const mockDeleteExpired = mock(() => Promise.resolve(1));
    const mockSessionRepo = {
      deleteExpired: mockDeleteExpired,
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      intervalMs: 60000,
      runOnStart: true,
    });

    scheduler.start();

    // Wait for the async cleanup to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockDeleteExpired).toHaveBeenCalled();

    scheduler.stop();
  });

  test("stop clears the interval without error", () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    scheduler.start();

    // Should not throw
    expect(() => scheduler.stop()).not.toThrow();
  });

  test("stop does nothing if scheduler was not started", () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo);

    // Should not throw when stopping without starting
    expect(() => scheduler.stop()).not.toThrow();
  });

  test("calling start twice does not throw", () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    scheduler.start();

    // Should not throw when called twice
    expect(() => scheduler.start()).not.toThrow();

    scheduler.stop();
  });

  test("uses default config values when not provided", () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo);

    // Should not throw with default config
    expect(() => scheduler.start()).not.toThrow();

    scheduler.stop();
  });

  test("runNow rethrows on failure", async () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.reject(new Error("DB error"))),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    await expect(scheduler.runNow()).rejects.toThrow("DB error");
  });

  test("handles unknown error type in runNow", async () => {
    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.reject("string error")),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    await expect(scheduler.runNow()).rejects.toBe("string error");
  });
});

describe("SessionCleanupResult interface", () => {
  test("has correct structure", () => {
    const result: SessionCleanupResult = {
      deletedCount: 10,
      startedAt: new Date(),
      completedAt: new Date(),
    };

    expect(result.deletedCount).toBe(10);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});
