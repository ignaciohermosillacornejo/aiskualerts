/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/prefer-promise-reject-errors */
import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import {
  runSessionCleanup,
  createSessionCleanupScheduler,
  type SessionCleanupResult,
} from "@/jobs/session-cleanup-job";
import type { SessionRepository } from "@/db/repositories/session";

// Save original console methods
const originalInfo = console.info;
const originalError = console.error;

describe("runSessionCleanup", () => {
  beforeEach(() => {
    console.info = mock(() => undefined);
    console.error = mock(() => undefined);
  });

  afterEach(() => {
    console.info = originalInfo;
    console.error = originalError;
  });

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

  test("logs message when sessions are deleted", async () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(3)),
    } as unknown as SessionRepository;

    await runSessionCleanup(mockSessionRepo);

    expect(mockInfo).toHaveBeenCalledWith("Cleaned up 3 expired sessions");
  });

  test("does not log when no sessions are deleted", async () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    await runSessionCleanup(mockSessionRepo);

    expect(mockInfo).not.toHaveBeenCalled();
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
  beforeEach(() => {
    console.info = mock(() => undefined);
    console.error = mock(() => undefined);
  });

  afterEach(() => {
    console.info = originalInfo;
    console.error = originalError;
  });

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

  test("start logs scheduler start message", () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      intervalMs: 60000,
      runOnStart: false,
    });

    scheduler.start();

    expect(mockInfo).toHaveBeenCalledWith(
      "Session cleanup scheduler started (interval: 1 minutes)"
    );

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

  test("stop clears the interval and logs message", () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    scheduler.start();
    scheduler.stop();

    expect(mockInfo).toHaveBeenCalledWith("Session cleanup scheduler stopped");
  });

  test("stop does nothing if scheduler was not started", () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo);

    scheduler.stop();

    expect(mockInfo).not.toHaveBeenCalledWith(
      "Session cleanup scheduler stopped"
    );
  });

  test("calling start twice logs already running message", () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    scheduler.start();
    scheduler.start();

    expect(mockInfo).toHaveBeenCalledWith(
      "Session cleanup scheduler is already running"
    );

    scheduler.stop();
  });

  test("uses default config values when not provided", () => {
    const mockInfo = mock(() => undefined);
    console.info = mockInfo;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.resolve(0)),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo);

    scheduler.start();

    // Default interval is 1 hour = 60 minutes
    expect(mockInfo).toHaveBeenCalledWith(
      "Session cleanup scheduler started (interval: 60 minutes)"
    );

    scheduler.stop();
  });

  test("runNow logs error and rethrows on failure", async () => {
    const mockError = mock(() => undefined);
    console.error = mockError;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.reject(new Error("DB error"))),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    await expect(scheduler.runNow()).rejects.toThrow("DB error");
    expect(mockError).toHaveBeenCalledWith("Session cleanup failed: DB error");
  });

  test("handles unknown error type in runNow", async () => {
    const mockError = mock(() => undefined);
    console.error = mockError;

    const mockSessionRepo = {
      deleteExpired: mock(() => Promise.reject("string error")),
    } as unknown as SessionRepository;

    const scheduler = createSessionCleanupScheduler(mockSessionRepo, {
      runOnStart: false,
    });

    await expect(scheduler.runNow()).rejects.toBe("string error");
    expect(mockError).toHaveBeenCalledWith(
      "Session cleanup failed: Unknown error"
    );
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
