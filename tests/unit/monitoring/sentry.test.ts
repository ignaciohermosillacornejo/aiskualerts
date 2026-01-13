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
  withSpan,
  withSpanSync,
  traceRequest,
  traceDbQuery,
  traceDbTransaction,
  traceBsaleApi,
  traceStripeApi,
  recordMetric,
  incrementCounter,
  recordDistribution,
  recordSyncMetrics,
  recordAlertMetrics,
  recordBillingMetrics,
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

// Create mock span
function createMockSpan() {
  return {
    setStatus: mock(() => undefined),
    end: mock(() => undefined),
  };
}

// Create mock metrics
function createMockMetrics() {
  return {
    gauge: mock(() => undefined),
    count: mock(() => undefined),
    distribution: mock(() => undefined),
    set: mock(() => undefined),
  };
}

// Create mock Sentry SDK
function createMockSentry() {
  const mockScope = createMockScope();
  const mockSpan = createMockSpan();
  const mockMetrics = createMockMetrics();
  return {
    init: mock(() => undefined),
    captureException: mock(() => "event-id-123"),
    captureMessage: mock(() => "message-id-456"),
    flush: mock(() => Promise.resolve(true)),
    withScope: mock((callback: (scope: ReturnType<typeof createMockScope>) => unknown) => {
      return callback(mockScope);
    }),
    startSpan: mock(<T>(_options: unknown, callback: (span: ReturnType<typeof createMockSpan>) => T): T => {
      return callback(mockSpan);
    }),
    startSpanManual: mock(<T>(_options: unknown, callback: (span: ReturnType<typeof createMockSpan>) => T): T => {
      return callback(mockSpan);
    }),
    setMeasurement: mock(() => undefined),
    metrics: mockMetrics,
    mockScope,
    mockSpan,
    mockMetrics,
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

// APM / Performance Monitoring Tests

describe("withSpan", () => {
  test("executes callback without tracing when Sentry is not initialized", async () => {
    const callback = mock(async () => "result");

    const result = await withSpan(
      { name: "test-span", op: "function" },
      callback
    );

    expect(result).toBe("result");
    expect(callback).toHaveBeenCalledTimes(1);
    expect(mockSentry.startSpan).not.toHaveBeenCalled();
  });

  test("creates span and executes callback when Sentry is initialized", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const callback = mock(async () => "result");

    const result = await withSpan(
      { name: "test-span", op: "function", attributes: { key: "value" } },
      callback
    );

    expect(result).toBe("result");
    expect(mockSentry.startSpan).toHaveBeenCalledTimes(1);
    expect(mockSentry.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "test-span",
        op: "function",
        attributes: { key: "value" },
      }),
      expect.any(Function)
    );
  });
});

describe("withSpanSync", () => {
  test("executes callback synchronously when Sentry is not initialized", () => {
    const callback = mock(() => "sync-result");

    const result = withSpanSync(
      { name: "sync-span", op: "function" },
      callback
    );

    expect(result).toBe("sync-result");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("creates span synchronously when Sentry is initialized", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const callback = mock(() => "sync-result");

    const result = withSpanSync(
      { name: "sync-span", op: "function" },
      callback
    );

    expect(result).toBe("sync-result");
    expect(mockSentry.startSpan).toHaveBeenCalledTimes(1);
  });
});

describe("traceRequest", () => {
  test("creates http.server span for request", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const callback = mock(async () => new Response("OK"));

    await traceRequest("GET", "/api/health", callback);

    expect(mockSentry.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "GET /api/health",
        op: "http.server",
        attributes: {
          "http.method": "GET",
          "http.route": "/api/health",
        },
      }),
      expect.any(Function)
    );
  });
});

describe("traceDbQuery", () => {
  test("creates db.query span for database query", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const callback = mock(async () => [{ id: 1 }]);

    await traceDbQuery("SELECT", "users", callback);

    expect(mockSentry.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "SELECT users",
        op: "db.query",
        attributes: {
          "db.operation": "SELECT",
          "db.table": "users",
          "db.system": "postgresql",
        },
      }),
      expect.any(Function)
    );
  });
});

describe("traceDbTransaction", () => {
  test("creates db.transaction span for database transaction", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const callback = mock(async () => "commit");

    await traceDbTransaction("create-user", callback);

    expect(mockSentry.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "transaction: create-user",
        op: "db.transaction",
        attributes: {
          "db.system": "postgresql",
        },
      }),
      expect.any(Function)
    );
  });
});

describe("traceBsaleApi", () => {
  test("creates api.bsale span for Bsale API call", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const callback = mock(async () => ({ items: [] }));

    await traceBsaleApi("/v1/stocks.json", callback);

    expect(mockSentry.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "bsale /v1/stocks.json",
        op: "api.bsale",
        attributes: {
          "http.url": "/v1/stocks.json",
          "peer.service": "bsale",
        },
      }),
      expect.any(Function)
    );
  });
});

describe("traceStripeApi", () => {
  test("creates api.stripe span for Stripe API call", async () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    const callback = mock(async () => ({ id: "cs_123" }));

    await traceStripeApi("checkout.sessions.create", callback);

    expect(mockSentry.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "stripe checkout.sessions.create",
        op: "api.stripe",
        attributes: {
          "stripe.operation": "checkout.sessions.create",
          "peer.service": "stripe",
        },
      }),
      expect.any(Function)
    );
  });
});

// Metrics Tests

describe("recordMetric", () => {
  test("does nothing when Sentry is not initialized", () => {
    recordMetric("test.metric", 100);

    expect(mockSentry.mockMetrics.gauge).not.toHaveBeenCalled();
  });

  test("records gauge metric when Sentry is initialized", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    recordMetric("test.metric", 100, "millisecond", { env: "test" });

    expect(mockSentry.mockMetrics.gauge).toHaveBeenCalledWith(
      "test.metric",
      100,
      { unit: "millisecond", attributes: { env: "test" } }
    );
  });
});

describe("incrementCounter", () => {
  test("does nothing when Sentry is not initialized", () => {
    incrementCounter("test.counter");

    expect(mockSentry.mockMetrics.count).not.toHaveBeenCalled();
  });

  test("increments counter when Sentry is initialized", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    incrementCounter("test.counter", 5, { type: "error" });

    expect(mockSentry.mockMetrics.count).toHaveBeenCalledWith(
      "test.counter",
      5,
      { attributes: { type: "error" } }
    );
  });

  test("defaults to increment by 1", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    incrementCounter("test.counter");

    expect(mockSentry.mockMetrics.count).toHaveBeenCalledWith(
      "test.counter",
      1,
      { attributes: undefined }
    );
  });
});

describe("recordDistribution", () => {
  test("does nothing when Sentry is not initialized", () => {
    recordDistribution("test.distribution", 50);

    expect(mockSentry.mockMetrics.distribution).not.toHaveBeenCalled();
  });

  test("records distribution when Sentry is initialized", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    recordDistribution("test.distribution", 150, "millisecond", { route: "/api/test" });

    expect(mockSentry.mockMetrics.distribution).toHaveBeenCalledWith(
      "test.distribution",
      150,
      { unit: "millisecond", attributes: { route: "/api/test" } }
    );
  });
});

describe("recordSyncMetrics", () => {
  test("records sync metrics with all values", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    recordSyncMetrics({
      itemsProcessed: 100,
      durationMs: 5000,
      errors: 2,
      tenantId: "tenant-123",
    });

    expect(mockSentry.mockMetrics.gauge).toHaveBeenCalledWith(
      "sync.items_processed",
      100,
      { unit: "items", attributes: { tenant_id: "tenant-123" } }
    );
    expect(mockSentry.mockMetrics.distribution).toHaveBeenCalledWith(
      "sync.duration",
      5000,
      { unit: "millisecond", attributes: { tenant_id: "tenant-123" } }
    );
    expect(mockSentry.mockMetrics.count).toHaveBeenCalledWith(
      "sync.errors",
      2,
      { attributes: { tenant_id: "tenant-123" } }
    );
  });

  test("does not record errors counter when no errors", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    recordSyncMetrics({
      itemsProcessed: 50,
      durationMs: 2000,
      errors: 0,
      tenantId: "tenant-123",
    });

    expect(mockSentry.mockMetrics.count).not.toHaveBeenCalledWith(
      "sync.errors",
      expect.anything(),
      expect.anything()
    );
  });
});

describe("recordAlertMetrics", () => {
  test("records alert generation metrics", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    recordAlertMetrics({
      alertsGenerated: 5,
      alertType: "low_stock",
      tenantId: "tenant-456",
    });

    expect(mockSentry.mockMetrics.count).toHaveBeenCalledWith(
      "alerts.generated",
      5,
      { attributes: { tenant_id: "tenant-456", alert_type: "low_stock" } }
    );
  });
});

describe("recordBillingMetrics", () => {
  test("records checkout completed event", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    recordBillingMetrics({
      eventType: "checkout_completed",
      tenantId: "tenant-789",
    });

    expect(mockSentry.mockMetrics.count).toHaveBeenCalledWith(
      "billing.events",
      1,
      { attributes: { event_type: "checkout_completed", tenant_id: "tenant-789" } }
    );
  });

  test("records subscription deleted event without tenant", () => {
    initializeSentry({
      dsn: "https://test@sentry.io/123",
      environment: "test",
    });

    recordBillingMetrics({
      eventType: "subscription_deleted",
    });

    expect(mockSentry.mockMetrics.count).toHaveBeenCalledWith(
      "billing.events",
      1,
      { attributes: { event_type: "subscription_deleted" } }
    );
  });
});

describe("createSentryConfig with APM settings", () => {
  test("sets sample rates for production", () => {
    const appConfig = {
      sentryDsn: "https://test@sentry.io/123",
      sentryEnvironment: "production",
    } as Config;

    const sentryConfig = createSentryConfig(appConfig);

    expect(sentryConfig.tracesSampleRate).toBe(0.1);
  });

  test("sets higher sample rates for non-production", () => {
    const appConfig = {
      sentryDsn: "https://test@sentry.io/123",
      sentryEnvironment: "development",
    } as Config;

    const sentryConfig = createSentryConfig(appConfig);

    expect(sentryConfig.tracesSampleRate).toBe(1.0);
  });
});

describe("initializeSentry with APM", () => {
  test("uses explicit sample rates when provided", () => {
    const config: SentryConfig = {
      dsn: "https://test@sentry.io/123",
      environment: "development",
      tracesSampleRate: 0.5,
    };

    initializeSentry(config);

    expect(mockSentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.5,
      })
    );
  });
});
