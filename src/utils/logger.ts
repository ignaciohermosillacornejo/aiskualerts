import { captureException } from "@/monitoring/sentry";

/**
 * Log levels supported by the logger
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logger interface for structured logging
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Patterns to identify sensitive keys that should be masked
 */
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /password/i,
  /secret/i,
  /key/i,
  /auth/i,
  /credential/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /session[_-]?token/i,
  /bearer/i,
  /authorization/i,
  /dsn/i,
];

/**
 * Check if a key name indicates sensitive data
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Mask a sensitive value, showing only first/last few characters
 */
function maskValue(value: unknown): string {
  if (typeof value !== "string") {
    return "[MASKED]";
  }
  if (value.length <= 8) {
    return "[MASKED]";
  }
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

/**
 * Recursively mask sensitive values in an object
 */
function maskSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      // eslint-disable-next-line security/detect-object-injection -- key from Object.entries is safe
      masked[key] = maskValue(value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // eslint-disable-next-line security/detect-object-injection -- key from Object.entries is safe
      masked[key] = maskSensitiveData(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // eslint-disable-next-line security/detect-object-injection -- key from Object.entries is safe
      masked[key] = value.map((item): unknown => {
        if (item !== null && typeof item === "object") {
          return maskSensitiveData(item as Record<string, unknown>);
        }
        return item as unknown;
      });
    } else {
      // eslint-disable-next-line security/detect-object-injection -- key from Object.entries is safe
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Format a log entry for human-readable output
 */
function formatHumanReadable(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  let output = `${timestamp} [${levelStr}] ${message}`;

  if (context && Object.keys(context).length > 0) {
    const maskedContext = maskSensitiveData(context);
    output += ` ${JSON.stringify(maskedContext)}`;
  }

  return output;
}

/**
 * Format a log entry as JSON for production
 */
function formatJson(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context && Object.keys(context).length > 0) {
    entry["context"] = maskSensitiveData(context);
  }

  if (error) {
    entry["error"] = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return JSON.stringify(entry);
}

/**
 * Production-ready logger implementation
 */
export class ProductionLogger implements Logger {
  private isProduction: boolean;

  constructor(isProduction?: boolean) {
    this.isProduction = isProduction ?? process.env.NODE_ENV === "production";
  }

  debug(message: string, context?: Record<string, unknown>): void {
    // Skip debug logs in production
    if (this.isProduction) {
      return;
    }
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log("error", message, context, error);

    // Send errors to Sentry
    if (error) {
      const maskedContext = context ? maskSensitiveData(context) : undefined;
      captureException(error, maskedContext ? { extra: maskedContext } : undefined);
    }
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    const output = this.isProduction
      ? formatJson(level, message, context, error)
      : formatHumanReadable(level, message, context);

    /* eslint-disable no-console -- Logger implementation must use console */
    switch (level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
    /* eslint-enable no-console */
  }
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  parent: Logger,
  defaultContext: Record<string, unknown>
): Logger {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      parent.debug(message, { ...defaultContext, ...context });
    },
    info(message: string, context?: Record<string, unknown>): void {
      parent.info(message, { ...defaultContext, ...context });
    },
    warn(message: string, context?: Record<string, unknown>): void {
      parent.warn(message, { ...defaultContext, ...context });
    },
    error(message: string, error?: Error, context?: Record<string, unknown>): void {
      parent.error(message, error, { ...defaultContext, ...context });
    },
  };
}

/**
 * Singleton logger instance for the application
 */
export const logger: Logger = new ProductionLogger();
