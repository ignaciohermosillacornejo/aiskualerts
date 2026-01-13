import * as SentrySdk from "@sentry/bun";
import type { Config } from "@/config";

export interface SentryConfig {
  dsn: string | undefined;
  environment: string;
  release?: string | undefined;
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
 * Sentry SDK interface for dependency injection
 */
export interface SentrySdkInterface {
  init: typeof SentrySdk.init;
  withScope: typeof SentrySdk.withScope;
  captureException: typeof SentrySdk.captureException;
  captureMessage: typeof SentrySdk.captureMessage;
  flush: typeof SentrySdk.flush;
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
 * Initialize Sentry error monitoring
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

  sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.environment === "production" ? 0.1 : 1.0,
    beforeSend(event) {
      // Don't send events in test environment
      if (process.env.NODE_ENV === "test") {
        return null;
      }
      return event;
    },
  });

  isInitialized = true;
  console.info(`[Sentry] Initialized for environment: ${config.environment}`);
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
