import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import {
  initializeSentry,
  createSentryConfig,
  captureException,
  captureMessage,
  isSentryInitialized,
  flushSentry,
  resetSentry,
  setupProcessErrorHandlers,
  setSentrySdk,
  type SentryConfig,
  type ErrorContext,
  type SentrySdkInterface,
} from "@/monitoring/sentry";
import type { Config } from "@/config";

// Create mock scope
function createMockScope() {
  return {
    setTag: mock(() => undefined),
    setExtra: mock(() => undefined),
    setUser: mock(() => undefined),
  };
}

// Create mock Sentry SDK
function createMockSentry() {
  const mockScope = createMockScope();
  return {
    init: mock(() => undefined),
    captureException: mock(() => "event-id-123"),
    captureMessage: mock(() => "message-id-456"),
    flush: mock(() => Promise.resolve(true)),
    withScope: mock((callback: (scope: ReturnType<typeof createMockScope>) => unknown) => {
      return callback(mockScope);
    }),
    mockScope,
  };
}

let mockSentry: ReturnType<typeof createMockSentry>;

beforeEach(() => {
  // Reset Sentry state before each test
  resetSentry();

  // Create fresh mock
  mockSentry = createMockSentry();

  // Set mock SDK
  setSentrySdk(mockSentry as unknown as SentrySdkInterface);
});

afterEach(() => {
  // Reset to default SDK
  resetSentry();
});

describe("initializeSentry", () => {
  test("skips initialization when DSN is not provided", () => {
    const config: SentryConfig = {
      dsn: undefined,
      environment: "development",
    };

    const result = initializeSentry(config);

    expect(result).toBe(false);
    expect(mockSentry.init).not.toHaveBeenCalled();
    expect(isSentryInitialized()).toBe(false);
  });

  test("initializes Sentry when DSN is provided", () => {
    const config: SentryConfig = {
      dsn: "https://test@sentry.io/123",
      environment: "production",
    };

    const result = initializeSentry(config);

    expect(result).toBe(true);
    expect(mockSentry.init).toHaveBeenCalledTimes(1);
    expect(isSentryInitialized()).toBe(true);
  });

  test("passes correct config to Sentry.init", () => {
    const config: SentryConfig = {
      dsn: "https://test@sentry.io/123",
      environment: "staging",
      release: "1.0.0",
    };

    initializeSentry(config);

    expect(mockSentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://test@sentry.io/123",
        environment: "staging",
        release: "1.0.0",
      })
    );
  });

  test("sets higher sample rate in non-production", () => {
    const config: SentryConfig = {
      dsn: "https://test@sentry.io/123",
      environment: "development",
    };

    initializeSentry(config);

    expect(mockSentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 1.0,
      })
    );
  });

  test("sets lower sample rate in production", () => {
    const config: SentryConfig = {
      dsn: "https://test@sentry.io/123",
      environment: "production",
    };

    initializeSentry(config);

    expect(mockSentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.1,
      })
    );
  });

  test("skips re-initialization if already initialized", () => {
    const config: SentryConfig = {
      dsn: "https://test@sentry.io/123",
      environment: "development",
    };

    initializeSentry(config);
    const result = initializeSentry(config);

    expect(result).toBe(true);
    expect(mockSentry.init).toHaveBeenCalledTimes(1);
  });
});

describe("createSentryConfig", () => {
  test("creates config from app config with DSN", () => {
    const appConfig = {
      sentryDsn: "https://test@sentry.io/123",
      sentryEnvironment: "production",
    } as Config;

    const sentryConfig = createSentryConfig(appConfig);

    expect(sentryConfig.dsn).toBe("https://test@sentry.io/123");
    expect(sentryConfig.environment).toBe("production");
  });

  test("handles undefined DSN", () => {
    const appConfig = {
      sentryDsn: undefined,
      sentryEnvironment: "development",
    } as Config;

    const sentryConfig = createSentryConfig(appConfig);

    expect(sentryConfig.dsn).toBeUndefined();
    expect(sentryConfig.environment).toBe("development");
  });
});

describe("captureException", () => {
  test("returns undefined when Sentry is not initialized", () => {
    const error = new Error("Test error");

    const result = captureException(error);

    expect(result).toBeUndefined();
    expect(mockSentry.withScope).not.toHaveBeenCalled();
  });

  test("captures exception when Sentry is initialized", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const error = new Error("Test error");
    const result = captureException(error);

    expect(result).toBe("event-id-123");
    expect(mockSentry.withScope).toHaveBeenCalledTimes(1);
    expect(mockSentry.captureException).toHaveBeenCalledWith(error);
  });

  test("sets tags from context", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const error = new Error("Test error");
    const context: ErrorContext = {
      tags: {
        route: "/api/test",
        method: "GET",
      },
    };

    captureException(error, context);

    expect(mockSentry.withScope).toHaveBeenCalledTimes(1);
    expect(mockSentry.mockScope.setTag).toHaveBeenCalledWith("route", "/api/test");
    expect(mockSentry.mockScope.setTag).toHaveBeenCalledWith("method", "GET");
  });

  test("sets extra data from context", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const error = new Error("Test error");
    const context: ErrorContext = {
      extra: {
        url: "https://example.com/api/test",
        requestId: "abc-123",
      },
    };

    captureException(error, context);

    expect(mockSentry.withScope).toHaveBeenCalledTimes(1);
    expect(mockSentry.mockScope.setExtra).toHaveBeenCalledWith("url", "https://example.com/api/test");
    expect(mockSentry.mockScope.setExtra).toHaveBeenCalledWith("requestId", "abc-123");
  });

  test("sets user from context", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const error = new Error("Test error");
    const context: ErrorContext = {
      user: {
        id: "user-123",
        email: "test@example.com",
        tenantId: "tenant-456",
      },
    };

    captureException(error, context);

    expect(mockSentry.withScope).toHaveBeenCalledTimes(1);
    expect(mockSentry.mockScope.setUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-123",
        email: "test@example.com",
        tenant_id: "tenant-456",
      })
    );
  });
});

describe("captureMessage", () => {
  test("returns undefined when Sentry is not initialized", () => {
    const result = captureMessage("Test message");

    expect(result).toBeUndefined();
    expect(mockSentry.withScope).not.toHaveBeenCalled();
  });

  test("captures message when Sentry is initialized", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const result = captureMessage("Test message", "info");

    expect(result).toBe("message-id-456");
    expect(mockSentry.withScope).toHaveBeenCalledTimes(1);
    expect(mockSentry.captureMessage).toHaveBeenCalledWith("Test message", "info");
  });

  test("defaults to info level", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    captureMessage("Test message");

    expect(mockSentry.captureMessage).toHaveBeenCalledWith("Test message", "info");
  });

  test("supports all severity levels", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const levels: ("fatal" | "error" | "warning" | "log" | "info" | "debug")[] = [
      "fatal",
      "error",
      "warning",
      "log",
      "info",
      "debug",
    ];

    for (const level of levels) {
      mockSentry.captureMessage.mockClear();
      captureMessage(`Test ${level}`, level);
      expect(mockSentry.captureMessage).toHaveBeenCalledWith(`Test ${level}`, level);
    }
  });

  test("sets context for messages", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const context: ErrorContext = {
      tags: { source: "scheduler" },
      extra: { jobId: "job-123" },
    };

    captureMessage("Job completed", "info", context);

    expect(mockSentry.mockScope.setTag).toHaveBeenCalledWith("source", "scheduler");
    expect(mockSentry.mockScope.setExtra).toHaveBeenCalledWith("jobId", "job-123");
  });
});

describe("isSentryInitialized", () => {
  test("returns false when not initialized", () => {
    expect(isSentryInitialized()).toBe(false);
  });

  test("returns true when initialized", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    expect(isSentryInitialized()).toBe(true);
  });
});

describe("flushSentry", () => {
  test("returns true when not initialized", async () => {
    const result = await flushSentry();

    expect(result).toBe(true);
    expect(mockSentry.flush).not.toHaveBeenCalled();
  });

  test("calls Sentry.flush when initialized", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    await flushSentry();

    expect(mockSentry.flush).toHaveBeenCalledWith(2000);
  });

  test("uses custom timeout", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    await flushSentry(5000);

    expect(mockSentry.flush).toHaveBeenCalledWith(5000);
  });
});

describe("resetSentry", () => {
  test("resets initialization state", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    expect(isSentryInitialized()).toBe(true);

    resetSentry();
    // Re-set mock after reset
    setSentrySdk(mockSentry as unknown as SentrySdkInterface);

    expect(isSentryInitialized()).toBe(false);
  });
});

describe("setupProcessErrorHandlers", () => {
  test("registers uncaughtException handler", () => {
    const originalListeners = process.listeners("uncaughtException");

    setupProcessErrorHandlers();

    const newListeners = process.listeners("uncaughtException");
    expect(newListeners.length).toBeGreaterThan(originalListeners.length);

    // Clean up: remove the added listener
    const addedListener = newListeners[newListeners.length - 1];
    if (addedListener) {
      process.removeListener("uncaughtException", addedListener);
    }
  });

  test("registers unhandledRejection handler", () => {
    const originalListeners = process.listeners("unhandledRejection");

    setupProcessErrorHandlers();

    const newListeners = process.listeners("unhandledRejection");
    expect(newListeners.length).toBeGreaterThan(originalListeners.length);

    // Clean up: remove the added listener
    const addedListener = newListeners[newListeners.length - 1];
    if (addedListener) {
      process.removeListener("unhandledRejection", addedListener);
    }
  });
});
