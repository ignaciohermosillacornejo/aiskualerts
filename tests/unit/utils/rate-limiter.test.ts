import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  RateLimiter,
  createRateLimitHeaders,
  getClientIdentifier,
  RateLimitPresets,
} from "@/utils/rate-limiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  afterEach(() => {
    limiter.stopCleanup();
    limiter.clear();
  });

  describe("constructor", () => {
    test("throws error for zero maxRequests", () => {
      expect(() => new RateLimiter({ maxRequests: 0, windowMs: 1000 })).toThrow(
        "maxRequests must be greater than 0"
      );
    });

    test("throws error for negative maxRequests", () => {
      expect(() => new RateLimiter({ maxRequests: -1, windowMs: 1000 })).toThrow(
        "maxRequests must be greater than 0"
      );
    });

    test("throws error for zero windowMs", () => {
      expect(() => new RateLimiter({ maxRequests: 10, windowMs: 0 })).toThrow(
        "windowMs must be greater than 0"
      );
    });

    test("throws error for negative windowMs", () => {
      expect(() => new RateLimiter({ maxRequests: 10, windowMs: -1 })).toThrow(
        "windowMs must be greater than 0"
      );
    });
  });

  describe("check", () => {
    test("allows requests within limit", () => {
      const result1 = limiter.check("client1");
      const result2 = limiter.check("client1");
      const result3 = limiter.check("client1");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
    });

    test("blocks requests exceeding limit", () => {
      limiter.check("client1");
      limiter.check("client1");
      limiter.check("client1");

      const result = limiter.check("client1");

      expect(result.allowed).toBe(false);
    });

    test("tracks remaining requests correctly", () => {
      expect(limiter.check("client1").remaining).toBe(2);
      expect(limiter.check("client1").remaining).toBe(1);
      expect(limiter.check("client1").remaining).toBe(0);
      expect(limiter.check("client1").remaining).toBe(0);
    });

    test("different clients have separate limits", () => {
      limiter.check("client1");
      limiter.check("client1");
      limiter.check("client1");

      expect(limiter.check("client1").allowed).toBe(false);
      expect(limiter.check("client2").allowed).toBe(true);
    });

    test("returns correct limit value", () => {
      const result = limiter.check("client1");
      expect(result.limit).toBe(3);
    });

    test("returns reset timestamp", () => {
      const now = Date.now();
      const result = limiter.check("client1");

      expect(result.resetAt).toBeGreaterThan(now);
      expect(result.resetAt).toBeLessThanOrEqual(now + 1000 + 50); // Window + small buffer
    });

    test("does not increment counter when blocked", () => {
      limiter.check("client1");
      limiter.check("client1");
      limiter.check("client1");
      limiter.check("client1"); // Blocked
      limiter.check("client1"); // Blocked

      // Status should show 0 remaining, not negative
      expect(limiter.status("client1").remaining).toBe(0);
    });
  });

  describe("status", () => {
    test("returns status without incrementing counter", () => {
      const status1 = limiter.status("client1");
      const status2 = limiter.status("client1");

      expect(status1.remaining).toBe(3);
      expect(status2.remaining).toBe(3);
    });

    test("reflects current state after checks", () => {
      limiter.check("client1");
      limiter.check("client1");

      const status = limiter.status("client1");

      expect(status.remaining).toBe(1);
      expect(status.allowed).toBe(true);
    });

    test("returns default values for unknown client", () => {
      const status = limiter.status("unknown-client");

      expect(status.allowed).toBe(true);
      expect(status.remaining).toBe(3);
      expect(status.limit).toBe(3);
    });
  });

  describe("reset", () => {
    test("resets rate limit for specific key", () => {
      limiter.check("client1");
      limiter.check("client1");
      limiter.check("client1");

      expect(limiter.check("client1").allowed).toBe(false);

      limiter.reset("client1");

      expect(limiter.check("client1").allowed).toBe(true);
    });

    test("does not affect other clients", () => {
      limiter.check("client1");
      limiter.check("client2");

      limiter.reset("client1");

      expect(limiter.status("client1").remaining).toBe(3);
      expect(limiter.status("client2").remaining).toBe(2);
    });
  });

  describe("cleanup", () => {
    test("removes expired entries", async () => {
      const fastLimiter = new RateLimiter({ maxRequests: 10, windowMs: 50 });

      fastLimiter.check("client1");
      expect(fastLimiter.size()).toBe(1);

      await Bun.sleep(100);

      fastLimiter.cleanup();
      expect(fastLimiter.size()).toBe(0);

      fastLimiter.stopCleanup();
    });

    test("keeps non-expired entries", () => {
      limiter.check("client1");

      limiter.cleanup();

      expect(limiter.size()).toBe(1);
    });
  });

  describe("startCleanup / stopCleanup", () => {
    test("starts and stops cleanup interval", async () => {
      const fastLimiter = new RateLimiter({ maxRequests: 10, windowMs: 50 });

      fastLimiter.check("client1");
      fastLimiter.startCleanup(50);

      await Bun.sleep(150);

      expect(fastLimiter.size()).toBe(0);

      fastLimiter.stopCleanup();
    });

    test("startCleanup is idempotent", () => {
      limiter.startCleanup();
      limiter.startCleanup(); // Should not throw or create duplicate intervals
      limiter.stopCleanup();
    });

    test("stopCleanup is idempotent", () => {
      limiter.startCleanup();
      limiter.stopCleanup();
      limiter.stopCleanup(); // Should not throw
    });
  });

  describe("size", () => {
    test("returns number of tracked keys", () => {
      expect(limiter.size()).toBe(0);

      limiter.check("client1");
      expect(limiter.size()).toBe(1);

      limiter.check("client2");
      expect(limiter.size()).toBe(2);

      limiter.check("client1");
      expect(limiter.size()).toBe(2);
    });
  });

  describe("clear", () => {
    test("removes all tracked keys", () => {
      limiter.check("client1");
      limiter.check("client2");
      limiter.check("client3");

      limiter.clear();

      expect(limiter.size()).toBe(0);
    });
  });

  describe("sliding window behavior", () => {
    test("allows requests after window passes", async () => {
      const fastLimiter = new RateLimiter({ maxRequests: 2, windowMs: 50 });

      fastLimiter.check("client1");
      fastLimiter.check("client1");
      expect(fastLimiter.check("client1").allowed).toBe(false);

      await Bun.sleep(75);

      expect(fastLimiter.check("client1").allowed).toBe(true);

      fastLimiter.stopCleanup();
    });
  });
});

describe("createRateLimitHeaders", () => {
  test("creates correct headers", () => {
    const result = {
      allowed: true,
      remaining: 5,
      resetAt: 1700000000000,
      limit: 10,
    };

    const headers = createRateLimitHeaders(result);

    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("5");
    expect(headers["X-RateLimit-Reset"]).toBe("1700000000"); // Unix timestamp in seconds
  });

  test("handles zero remaining", () => {
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: 1700000000000,
      limit: 10,
    };

    const headers = createRateLimitHeaders(result);

    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });
});

describe("getClientIdentifier", () => {
  test("extracts IP from X-Forwarded-For header", () => {
    const request = new Request("http://localhost/api", {
      headers: { "X-Forwarded-For": "192.168.1.100, 10.0.0.1, 172.16.0.1" },
    });

    const identifier = getClientIdentifier(request);

    expect(identifier).toBe("192.168.1.100");
  });

  test("extracts single IP from X-Forwarded-For", () => {
    const request = new Request("http://localhost/api", {
      headers: { "X-Forwarded-For": "192.168.1.100" },
    });

    const identifier = getClientIdentifier(request);

    expect(identifier).toBe("192.168.1.100");
  });

  test("uses X-Real-IP as fallback", () => {
    const request = new Request("http://localhost/api", {
      headers: { "X-Real-IP": "10.0.0.1" },
    });

    const identifier = getClientIdentifier(request);

    expect(identifier).toBe("10.0.0.1");
  });

  test("prefers X-Forwarded-For over X-Real-IP", () => {
    const request = new Request("http://localhost/api", {
      headers: {
        "X-Forwarded-For": "192.168.1.100",
        "X-Real-IP": "10.0.0.1",
      },
    });

    const identifier = getClientIdentifier(request);

    expect(identifier).toBe("192.168.1.100");
  });

  test("returns unknown for request without IP headers", () => {
    const request = new Request("http://localhost/api");

    const identifier = getClientIdentifier(request);

    expect(identifier).toBe("unknown");
  });

  test("trims whitespace from IP addresses", () => {
    const request = new Request("http://localhost/api", {
      headers: { "X-Forwarded-For": "  192.168.1.100  " },
    });

    const identifier = getClientIdentifier(request);

    expect(identifier).toBe("192.168.1.100");
  });
});

describe("RateLimitPresets", () => {
  test("auth preset has correct values", () => {
    expect(RateLimitPresets.auth).toEqual({
      maxRequests: 10,
      windowMs: 60 * 1000,
    });
  });

  test("api preset has correct values", () => {
    expect(RateLimitPresets.api).toEqual({
      maxRequests: 100,
      windowMs: 60 * 1000,
    });
  });

  test("strict preset has correct values", () => {
    expect(RateLimitPresets.strict).toEqual({
      maxRequests: 5,
      windowMs: 60 * 1000,
    });
  });

  test("webhook preset has correct values", () => {
    expect(RateLimitPresets.webhook).toEqual({
      maxRequests: 1000,
      windowMs: 60 * 1000,
    });
  });
});
