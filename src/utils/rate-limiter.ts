/**
 * Sliding window rate limiter implementation
 * Uses an in-memory store for rate limit tracking
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the rate limit resets */
  resetAt: number;
  /** Total requests allowed per window */
  limit: number;
}

interface WindowEntry {
  /** Timestamps of requests in the current window */
  timestamps: number[];
  /** When this entry was last cleaned */
  lastCleanup: number;
}

/**
 * In-memory sliding window rate limiter
 */
export class RateLimiter {
  private store = new Map<string, WindowEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private config: RateLimitConfig) {
    // Validate config
    if (config.maxRequests <= 0) {
      throw new Error("maxRequests must be greater than 0");
    }
    if (config.windowMs <= 0) {
      throw new Error("windowMs must be greater than 0");
    }
  }

  /**
   * Check if a request is allowed and update the rate limit counter
   * @param key - Unique identifier for the client (e.g., IP address, user ID)
   * @returns Rate limit result with allowed status and metadata
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.store.get(key);

    if (!entry) {
      entry = { timestamps: [], lastCleanup: now };
      this.store.set(key, entry);
    }

    // Clean up old timestamps (sliding window)
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
    entry.lastCleanup = now;

    const currentCount = entry.timestamps.length;
    const allowed = currentCount < this.config.maxRequests;

    if (allowed) {
      entry.timestamps.push(now);
    }

    // Calculate reset time (when the oldest request in window expires)
    const oldestTimestamp = entry.timestamps[0] ?? now;
    const resetAt = oldestTimestamp + this.config.windowMs;

    return {
      allowed,
      remaining: Math.max(0, this.config.maxRequests - entry.timestamps.length),
      resetAt,
      limit: this.config.maxRequests,
    };
  }

  /**
   * Reset the rate limit for a specific key
   * @param key - The key to reset
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Get the current status without incrementing the counter
   * @param key - The key to check
   * @returns Rate limit result
   */
  status(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const entry = this.store.get(key);

    if (!entry) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
        limit: this.config.maxRequests,
      };
    }

    // Filter to current window without modifying
    const currentTimestamps = entry.timestamps.filter((ts) => ts > windowStart);
    const currentCount = currentTimestamps.length;

    const oldestTimestamp = currentTimestamps[0] ?? now;
    const resetAt = oldestTimestamp + this.config.windowMs;

    return {
      allowed: currentCount < this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - currentCount),
      resetAt,
      limit: this.config.maxRequests,
    };
  }

  /**
   * Start automatic cleanup of expired entries
   * @param intervalMs - How often to run cleanup (default: windowMs)
   */
  startCleanup(intervalMs?: number): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    const interval = intervalMs ?? this.config.windowMs;
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, interval);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Manually run cleanup to remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, entry] of this.store.entries()) {
      // Remove timestamps outside the window
      entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

      // Remove entry if no timestamps remain
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get the number of tracked keys
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Creates rate limit headers for HTTP responses
 * @param result - Rate limit check result
 * @returns Headers object with rate limit information
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)), // Unix timestamp in seconds
  };
}

/**
 * Extract client identifier from request
 * Uses X-Forwarded-For header if behind proxy, otherwise falls back to a default
 * @param request - The HTTP request
 * @returns Client identifier string
 */
export function getClientIdentifier(request: Request): string {
  // Check for proxy headers first
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (forwardedFor) {
    // Get the first IP in the chain (original client)
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  // Check for other common proxy headers
  const realIp = request.headers.get("X-Real-IP");
  if (realIp) return realIp.trim();

  // For Bun.serve, we can try to get the socket address
  // But in most cases, we'll need the proxy headers
  // Fall back to a default for local development
  return "unknown";
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimitPresets = {
  /** Authentication endpoints: 10 requests per minute */
  auth: { maxRequests: 10, windowMs: 60 * 1000 },

  /** API endpoints: 100 requests per minute */
  api: { maxRequests: 100, windowMs: 60 * 1000 },

  /** Strict rate limit: 5 requests per minute */
  strict: { maxRequests: 5, windowMs: 60 * 1000 },

  /** Webhook endpoints: 1000 requests per minute */
  webhook: { maxRequests: 1000, windowMs: 60 * 1000 },
} as const;
