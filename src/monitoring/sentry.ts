import * as SentrySdk from "@sentry/bun";
import type { Span } from "@sentry/bun";
import type { StartSpanOptions } from "@sentry/core";
import type { Config } from "@/config";

export interface SentryConfig {
  dsn: string | undefined;
  environment: string;
  release?: string | undefined;
  tracesSampleRate?: number;
}

/**
 * Severity levels for Sentry messages
 */
export type SeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

/**
 * Context to attach to error reports
 */
export interface ErrorContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: {
    id?: string;
    email?: string;
    tenantId?: string;
  };
}

/**
 * Metrics interface for dependency injection
 */
export interface MetricsInterface {
  gauge: (name: string, value: number, options?: { unit?: string; attributes?: Record<string, string | number | boolean> }) => void;
  count: (name: string, value?: number, options?: { attributes?: Record<string, string | number | boolean> }) => void;
  distribution: (name: string, value: number, options?: { unit?: string; attributes?: Record<string, string | number | boolean> }) => void;
}

/**
 * Sentry SDK interface for dependency injection
 */
export interface SentrySdkInterface {
  init: typeof SentrySdk.init;
  withScope: typeof SentrySdk.withScope;
  captureException: typeof SentrySdk.captureException;
  captureMessage: typeof SentrySdk.captureMessage;
  flush: typeof SentrySdk.flush;
  startSpan: typeof SentrySdk.startSpan;
  startSpanManual: typeof SentrySdk.startSpanManual;
  setMeasurement: typeof SentrySdk.setMeasurement;
  metrics: MetricsInterface;
}

let isInitialized = false;
let sentry: SentrySdkInterface = SentrySdk;

/**
 * Set the Sentry SDK implementation (for testing)
 */
export function setSentrySdk(sdk: SentrySdkInterface): void {
  sentry = sdk;
}

/**
 * Get the current Sentry SDK implementation
 */
export function getSentrySdk(): SentrySdkInterface {
  return sentry;
}

/**
 * Initialize Sentry error monitoring with performance monitoring
 * Only initializes if DSN is provided
 */
export function initializeSentry(config: SentryConfig): boolean {
  if (!config.dsn) {
    console.info("[Sentry] DSN not provided, skipping initialization");
    return false;
  }

  if (isInitialized) {
    console.info("[Sentry] Already initialized, skipping");
    return true;
  }

  // Determine sample rate based on environment and explicit config
  const tracesSampleRate =
    config.tracesSampleRate ?? (config.environment === "production" ? 0.1 : 1.0);

  sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    // Performance monitoring
    tracesSampleRate,
    // Enable automatic instrumentation for common operations
    integrations: [],
    beforeSend(event) {
      // Don't send events in test environment
      if (process.env.NODE_ENV === "test") {
        return null;
      }
      return event;
    },
    beforeSendTransaction(event) {
      // Don't send transactions in test environment
      if (process.env.NODE_ENV === "test") {
        return null;
      }
      return event;
    },
  });

  isInitialized = true;
  console.info(
    `[Sentry] Initialized for environment: ${config.environment} ` +
      `(tracesSampleRate: ${String(tracesSampleRate)})`
  );
  return true;
}

/**
 * Create Sentry config from application config
 */
export function createSentryConfig(config: Config): SentryConfig {
  return {
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment,
    release: process.env["APP_VERSION"],
    tracesSampleRate: config.sentryEnvironment === "production" ? 0.1 : 1.0,
  };
}

/**
 * Capture an exception and send to Sentry
 */
export function captureException(
  error: unknown,
  context?: ErrorContext
): string | undefined {
  if (!isInitialized) {
    console.error("[Sentry] Not initialized, cannot capture exception:", error);
    return undefined;
  }

  return sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }

    if (context?.user) {
      const user: Record<string, string> = {};
      if (context.user.id) user["id"] = context.user.id;
      if (context.user.email) user["email"] = context.user.email;
      if (context.user.tenantId) user["tenant_id"] = context.user.tenantId;
      scope.setUser(user);
    }

    return sentry.captureException(error);
  });
}

/**
 * Capture a message and send to Sentry
 */
export function captureMessage(
  message: string,
  level: SeverityLevel = "info",
  context?: ErrorContext
): string | undefined {
  if (!isInitialized) {
    console.info("[Sentry] Not initialized, cannot capture message:", message);
    return undefined;
  }

  return sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }

    if (context?.user) {
      const user: Record<string, string> = {};
      if (context.user.id) user["id"] = context.user.id;
      if (context.user.email) user["email"] = context.user.email;
      if (context.user.tenantId) user["tenant_id"] = context.user.tenantId;
      scope.setUser(user);
    }

    return sentry.captureMessage(message, level);
  });
}

/**
 * Check if Sentry is initialized
 */
export function isSentryInitialized(): boolean {
  return isInitialized;
}

/**
 * Flush pending events before shutdown
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
  if (!isInitialized) {
    return true;
  }
  return await sentry.flush(timeout);
}

/**
 * Reset Sentry initialization state (for testing)
 */
export function resetSentry(): void {
  isInitialized = false;
  sentry = SentrySdk;
}

// ============================================================================
// Performance Monitoring / APM Utilities
// ============================================================================

/**
 * Span operation types for categorization
 */
export type SpanOperation =
  | "http.server"
  | "http.client"
  | "db.query"
  | "db.transaction"
  | "api.bsale"
  | "api.stripe"
  | "function"
  | "task";

/**
 * Options for creating a span
 */
export interface SpanOptions {
  name: string;
  op: SpanOperation;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Start a span for tracing an operation
 * Returns the result of the callback
 */
export async function withSpan<T>(
  options: SpanOptions,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  if (!isInitialized) {
    // If Sentry isn't initialized, just run the callback without tracing
    return callback({} as Span);
  }

  const spanOptions: StartSpanOptions = {
    name: options.name,
    op: options.op,
  };

  if (options.attributes) {
    spanOptions.attributes = options.attributes;
  }

  return sentry.startSpan(spanOptions, callback);
}

/**
 * Start a span synchronously
 */
export function withSpanSync<T>(
  options: SpanOptions,
  callback: (span: Span) => T
): T {
  if (!isInitialized) {
    return callback({} as Span);
  }

  const spanOptions: StartSpanOptions = {
    name: options.name,
    op: options.op,
  };

  if (options.attributes) {
    spanOptions.attributes = options.attributes;
  }

  return sentry.startSpan(spanOptions, callback);
}

/**
 * Trace an HTTP request (API route)
 */
export async function traceRequest<T>(
  method: string,
  path: string,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: `${method} ${path}`,
      op: "http.server",
      attributes: {
        "http.method": method,
        "http.route": path,
      },
    },
    callback
  );
}

/**
 * Trace a database query
 */
export async function traceDbQuery<T>(
  operation: string,
  table: string,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: `${operation} ${table}`,
      op: "db.query",
      attributes: {
        "db.operation": operation,
        "db.table": table,
        "db.system": "postgresql",
      },
    },
    callback
  );
}

/**
 * Trace a database transaction
 */
export async function traceDbTransaction<T>(
  name: string,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: `transaction: ${name}`,
      op: "db.transaction",
      attributes: {
        "db.system": "postgresql",
      },
    },
    callback
  );
}

/**
 * Trace an external API call to Bsale
 */
export async function traceBsaleApi<T>(
  endpoint: string,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: `bsale ${endpoint}`,
      op: "api.bsale",
      attributes: {
        "http.url": endpoint,
        "peer.service": "bsale",
      },
    },
    callback
  );
}

/**
 * Trace an external API call to Stripe
 */
export async function traceStripeApi<T>(
  operation: string,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: `stripe ${operation}`,
      op: "api.stripe",
      attributes: {
        "stripe.operation": operation,
        "peer.service": "stripe",
      },
    },
    callback
  );
}

// ============================================================================
// Custom Business Metrics
// ============================================================================

/**
 * Record a custom metric for business operations
 */
export function recordMetric(
  name: string,
  value: number,
  unit?: string,
  tags?: Record<string, string>
): void {
  if (!isInitialized) {
    return;
  }

  try {
    const options: { unit?: string; attributes?: Record<string, string | number | boolean> } = {};
    if (unit) options.unit = unit;
    if (tags) options.attributes = tags;
    sentry.metrics.gauge(name, value, options);
  } catch (error) {
    console.warn(`[Sentry] Failed to record metric ${name}:`, error);
  }
}

/**
 * Increment a counter metric
 */
export function incrementCounter(
  name: string,
  value = 1,
  tags?: Record<string, string>
): void {
  if (!isInitialized) {
    return;
  }

  try {
    const options: { attributes?: Record<string, string | number | boolean> } = {};
    if (tags) options.attributes = tags;
    sentry.metrics.count(name, value, options);
  } catch (error) {
    console.warn(`[Sentry] Failed to increment counter ${name}:`, error);
  }
}

/**
 * Record a distribution metric (for timing/size distributions)
 */
export function recordDistribution(
  name: string,
  value: number,
  unit?: string,
  tags?: Record<string, string>
): void {
  if (!isInitialized) {
    return;
  }

  try {
    const options: { unit?: string; attributes?: Record<string, string | number | boolean> } = {};
    if (unit) options.unit = unit;
    if (tags) options.attributes = tags;
    sentry.metrics.distribution(name, value, options);
  } catch (error) {
    console.warn(`[Sentry] Failed to record distribution ${name}:`, error);
  }
}

// Business-specific metric helpers

/**
 * Record stock sync metrics
 */
export function recordSyncMetrics(metrics: {
  itemsProcessed: number;
  durationMs: number;
  errors: number;
  tenantId: string;
}): void {
  const tags = { tenant_id: metrics.tenantId };
  recordMetric("sync.items_processed", metrics.itemsProcessed, "items", tags);
  recordDistribution("sync.duration", metrics.durationMs, "millisecond", tags);
  if (metrics.errors > 0) {
    incrementCounter("sync.errors", metrics.errors, tags);
  }
}

/**
 * Record alert generation metrics
 */
export function recordAlertMetrics(metrics: {
  alertsGenerated: number;
  alertType: string;
  tenantId: string;
}): void {
  const tags = {
    tenant_id: metrics.tenantId,
    alert_type: metrics.alertType,
  };
  incrementCounter("alerts.generated", metrics.alertsGenerated, tags);
}

/**
 * Record billing event metrics
 */
export function recordBillingMetrics(metrics: {
  eventType: "checkout_completed" | "subscription_deleted";
  tenantId?: string;
}): void {
  const tags: Record<string, string> = { event_type: metrics.eventType };
  if (metrics.tenantId) {
    tags["tenant_id"] = metrics.tenantId;
  }
  incrementCounter("billing.events", 1, tags);
}

/**
 * Setup process error handlers to capture unhandled errors
 */
export function setupProcessErrorHandlers(): void {
  process.on("uncaughtException", (error: Error) => {
    console.error("[Sentry] Uncaught exception:", error);
    captureException(error, {
      tags: { type: "uncaughtException" },
    });
  });

  process.on("unhandledRejection", (reason: unknown) => {
    console.error("[Sentry] Unhandled rejection:", reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    captureException(error, {
      tags: { type: "unhandledRejection" },
    });
  });
}
