import {
  RateLimiter,
  type RateLimitConfig,
  type RateLimitResult,
  createRateLimitHeaders,
  getClientIdentifier,
  RateLimitPresets,
} from "@/utils/rate-limiter";
import { jsonWithCors } from "@/server";

export interface RateLimitMiddlewareConfig extends RateLimitConfig {
  /** Skip rate limiting for certain paths */
  skipPaths?: string[];
  /** Custom key generator (default: IP-based) */
  keyGenerator?: (request: Request) => string;
  /** Custom handler for rate-limited requests */
  onRateLimited?: (request: Request, result: RateLimitResult) => Response;
}

export interface RateLimitMiddleware {
  /** Check rate limit and return a response if limited, null otherwise */
  check(request: Request): Response | null;
  /** Get the rate limiter instance for manual operations */
  getLimiter(): RateLimiter;
  /** Stop cleanup interval (for graceful shutdown) */
  stop(): void;
}

/**
 * Creates rate limit middleware for specific routes
 *
 * @param config - Rate limit configuration
 * @returns Middleware that returns a Response if rate limited, null otherwise
 */
export function createRateLimitMiddleware(
  config: RateLimitMiddlewareConfig
): RateLimitMiddleware {
  const limiter = new RateLimiter({
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
  });

  // Start automatic cleanup
  limiter.startCleanup();

  const keyGenerator = config.keyGenerator ?? getClientIdentifier;

  const defaultOnRateLimited = (_request: Request, result: RateLimitResult): Response => {
    return jsonWithCors(
      {
        error: "Too many requests",
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          ...createRateLimitHeaders(result),
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      }
    );
  };

  const onRateLimited = config.onRateLimited ?? defaultOnRateLimited;

  return {
    check(request: Request): Response | null {
      // Skip rate limiting for configured paths
      if (config.skipPaths) {
        const url = new URL(request.url);
        if (config.skipPaths.some((path) => url.pathname.startsWith(path))) {
          return null;
        }
      }

      const key = keyGenerator(request);
      const result = limiter.check(key);

      if (!result.allowed) {
        return onRateLimited(request, result);
      }

      return null;
    },

    getLimiter(): RateLimiter {
      return limiter;
    },

    stop(): void {
      limiter.stopCleanup();
    },
  };
}

/**
 * Creates a path-based rate limiter that applies different limits to different routes
 */
export function createPathBasedRateLimiter(
  configs: Record<string, RateLimitConfig>
): {
  check(request: Request): Response | null;
  stop(): void;
} {
  const limiters = new Map<string, RateLimiter>();

  // Create limiter for each path pattern
  for (const [_path, config] of Object.entries(configs)) {
    const limiter = new RateLimiter(config);
    limiter.startCleanup();
    limiters.set(_path, limiter);
  }

  return {
    check(request: Request): Response | null {
      const url = new URL(request.url);
      const clientKey = getClientIdentifier(request);

      // Find matching path and apply rate limit
      for (const [path, limiter] of limiters.entries()) {
        if (url.pathname.startsWith(path)) {
          const result = limiter.check(clientKey);

          if (!result.allowed) {
            return jsonWithCors(
              {
                error: "Too many requests",
                retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
              },
              {
                status: 429,
                headers: {
                  ...createRateLimitHeaders(result),
                  "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
                },
              }
            );
          }

          // Only apply first matching limiter
          break;
        }
      }

      return null;
    },

    stop(): void {
      for (const limiter of limiters.values()) {
        limiter.stopCleanup();
      }
    },
  };
}

/**
 * Higher-order function to wrap a route handler with rate limiting
 */
export function withRateLimit(
  handler: (request: Request) => Response | Promise<Response>,
  config: RateLimitConfig
): (request: Request) => Response | Promise<Response> {
  const middleware = createRateLimitMiddleware(config);

  return async (request: Request): Promise<Response> => {
    const rateLimitResponse = middleware.check(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const response = await handler(request);

    // Add rate limit headers to successful responses
    const key = getClientIdentifier(request);
    const result = middleware.getLimiter().status(key);
    const headers = new Headers(response.headers);

    for (const [headerKey, value] of Object.entries(createRateLimitHeaders(result))) {
      headers.set(headerKey, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

// Re-export presets for convenience
export { RateLimitPresets };
