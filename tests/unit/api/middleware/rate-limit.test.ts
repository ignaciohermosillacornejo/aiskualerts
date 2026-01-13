/* eslint-disable @typescript-eslint/await-thenable */
import { test, expect, describe, afterEach } from "bun:test";
import {
  createRateLimitMiddleware,
  createPathBasedRateLimiter,
  withRateLimit,
  RateLimitPresets,
  type RateLimitMiddleware,
} from "../../../../src/api/middleware/rate-limit";

describe("Rate Limit Middleware", () => {
  let middleware: RateLimitMiddleware;

  afterEach(() => {
    // Clean up cleanup intervals
    middleware?.stop();
  });

  describe("createRateLimitMiddleware", () => {
    test("creates middleware with required configuration", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 10,
        windowMs: 60000,
      });

      expect(typeof middleware.check).toBe("function");
      expect(typeof middleware.getLimiter).toBe("function");
      expect(typeof middleware.stop).toBe("function");
    });

    test("exposes underlying limiter", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 5,
        windowMs: 1000,
      });

      const limiter = middleware.getLimiter();

      expect(limiter).toBeDefined();
      expect(typeof limiter.check).toBe("function");
      expect(typeof limiter.reset).toBe("function");
      expect(typeof limiter.status).toBe("function");
    });

    test("can stop cleanup interval", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 10,
        windowMs: 60000,
      });

      // Should not throw
      middleware.stop();
      middleware.stop(); // Calling twice should be safe
    });
  });

  describe("check", () => {
    test("allows requests under the limit", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 5,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: {
          "X-Forwarded-For": "192.168.1.1",
        },
      });

      const result = middleware.check(request);

      expect(result).toBeNull();
    });

    test("allows multiple requests from different IPs", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      const request1 = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      });

      const request2 = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "192.168.1.2" },
      });

      // Both should be allowed
      expect(middleware.check(request1)).toBeNull();
      expect(middleware.check(request1)).toBeNull();
      expect(middleware.check(request2)).toBeNull();
      expect(middleware.check(request2)).toBeNull();
    });

    test("blocks requests when limit is exceeded", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      });

      // First two should pass
      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).toBeNull();

      // Third should be blocked
      const result = middleware.check(request);
      expect(result).not.toBeNull();
    });

    test("returns 429 status when rate limited", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "10.0.0.1" },
      });

      middleware.check(request); // First request passes
      const result = middleware.check(request); // Second request blocked

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    test("includes error message in response body", async () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "10.0.0.2" },
      });

      middleware.check(request);
      const result = middleware.check(request);

      expect(result).not.toBeNull();
      const body = await result?.json();
      expect(body).toHaveProperty("error", "Too many requests");
      expect(body).toHaveProperty("retryAfter");
      expect(typeof body.retryAfter).toBe("number");
    });

    test("uses X-Real-IP header when X-Forwarded-For is absent", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Real-IP": "172.16.0.1" },
      });

      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).not.toBeNull();
    });

    test("handles requests without IP headers", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test");

      // Both requests use "unknown" as client identifier
      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).not.toBeNull();
    });
  });

  describe("429 response headers", () => {
    test("includes X-RateLimit-Limit header", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 5,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "1.1.1.1" },
      });

      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        middleware.check(request);
      }

      const result = middleware.check(request);

      expect(result).not.toBeNull();
      expect(result?.headers.get("X-RateLimit-Limit")).toBe("5");
    });

    test("includes X-RateLimit-Remaining header", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 3,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "1.1.1.2" },
      });

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        middleware.check(request);
      }

      const result = middleware.check(request);

      expect(result).not.toBeNull();
      expect(result?.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    test("includes X-RateLimit-Reset header", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "1.1.1.3" },
      });

      middleware.check(request);
      const result = middleware.check(request);

      expect(result).not.toBeNull();
      const resetHeader = result?.headers.get("X-RateLimit-Reset");
      expect(resetHeader).toBeDefined();
      // Should be a Unix timestamp in seconds
      const resetTime = parseInt(resetHeader ?? "0", 10);
      expect(resetTime).toBeGreaterThan(Date.now() / 1000);
    });

    test("includes Retry-After header", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "1.1.1.4" },
      });

      middleware.check(request);
      const result = middleware.check(request);

      expect(result).not.toBeNull();
      const retryAfter = result?.headers.get("Retry-After");
      expect(retryAfter).toBeDefined();
      expect(parseInt(retryAfter ?? "0", 10)).toBeGreaterThan(0);
    });

    test("includes CORS headers", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "1.1.1.5" },
      });

      middleware.check(request);
      const result = middleware.check(request);

      expect(result).not.toBeNull();
      expect(result?.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    });
  });

  describe("skip paths", () => {
    test("skips rate limiting for configured paths", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        skipPaths: ["/api/health", "/api/public/"],
      });

      const request = new Request("http://localhost/api/health", {
        headers: { "X-Forwarded-For": "2.2.2.1" },
      });

      // All requests should pass (not rate limited)
      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).toBeNull();
    });

    test("skips paths matching prefix", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        skipPaths: ["/api/public/"],
      });

      const request = new Request("http://localhost/api/public/data/users", {
        headers: { "X-Forwarded-For": "2.2.2.2" },
      });

      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).toBeNull();
    });

    test("applies rate limiting to non-skipped paths", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        skipPaths: ["/api/health"],
      });

      const request = new Request("http://localhost/api/users", {
        headers: { "X-Forwarded-For": "2.2.2.3" },
      });

      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).not.toBeNull();
    });

    test("handles empty skipPaths array", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        skipPaths: [],
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "2.2.2.4" },
      });

      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).not.toBeNull();
    });

    test("handles undefined skipPaths", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request("http://localhost/api/health", {
        headers: { "X-Forwarded-For": "2.2.2.5" },
      });

      expect(middleware.check(request)).toBeNull();
      expect(middleware.check(request)).not.toBeNull();
    });
  });

  describe("custom key generator", () => {
    test("uses custom key generator function", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 2,
        windowMs: 60000,
        keyGenerator: (req) => {
          // Use user-id header as rate limit key
          return req.headers.get("X-User-ID") ?? "anonymous";
        },
      });

      // User 1 gets 2 requests
      const user1Request = new Request("http://localhost/api/test", {
        headers: {
          "X-Forwarded-For": "3.3.3.1", // IP is ignored
          "X-User-ID": "user-1",
        },
      });

      // User 2 gets separate 2 requests
      const user2Request = new Request("http://localhost/api/test", {
        headers: {
          "X-Forwarded-For": "3.3.3.1", // Same IP
          "X-User-ID": "user-2",
        },
      });

      // Both users get their own limit
      expect(middleware.check(user1Request)).toBeNull();
      expect(middleware.check(user1Request)).toBeNull();
      expect(middleware.check(user2Request)).toBeNull();
      expect(middleware.check(user2Request)).toBeNull();

      // Now both are at limit
      expect(middleware.check(user1Request)).not.toBeNull();
      expect(middleware.check(user2Request)).not.toBeNull();
    });

    test("custom key generator can use URL path", () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: (req) => {
          const url = new URL(req.url);
          const ip = req.headers.get("X-Forwarded-For") ?? "unknown";
          return `${ip}:${url.pathname}`;
        },
      });

      const request1 = new Request("http://localhost/api/users", {
        headers: { "X-Forwarded-For": "4.4.4.1" },
      });

      const request2 = new Request("http://localhost/api/products", {
        headers: { "X-Forwarded-For": "4.4.4.1" },
      });

      // Same IP, different paths - separate limits
      expect(middleware.check(request1)).toBeNull();
      expect(middleware.check(request2)).toBeNull();

      // Each path is now at limit
      expect(middleware.check(request1)).not.toBeNull();
      expect(middleware.check(request2)).not.toBeNull();
    });
  });

  describe("custom onRateLimited handler", () => {
    test("uses custom handler when rate limited", async () => {
      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        onRateLimited: (_req, result) => {
          return new Response(
            JSON.stringify({
              customError: "Rate limit exceeded",
              remaining: result.remaining,
              limit: result.limit,
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        },
      });

      const request = new Request("http://localhost/api/test", {
        headers: { "X-Forwarded-For": "5.5.5.1" },
      });

      middleware.check(request);
      const result = middleware.check(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(503);

      const body = await result?.json();
      expect(body).toEqual({
        customError: "Rate limit exceeded",
        remaining: 0,
        limit: 1,
      });
    });

    test("custom handler receives request and result", async () => {
      let capturedUrl = "";
      let capturedAllowed = true;

      middleware = createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 60000,
        onRateLimited: (req, result) => {
          capturedUrl = req.url;
          capturedAllowed = result.allowed;
          return new Response("blocked", { status: 429 });
        },
      });

      const request = new Request("http://localhost/api/special/endpoint", {
        headers: { "X-Forwarded-For": "5.5.5.2" },
      });

      middleware.check(request);
      middleware.check(request);

      expect(capturedUrl).toBe("http://localhost/api/special/endpoint");
      expect(capturedAllowed).toBe(false);
    });
  });
});

describe("createPathBasedRateLimiter", () => {
  let limiter: { check: (request: Request) => Response | null; stop: () => void };

  afterEach(() => {
    limiter?.stop();
  });

  test("creates limiter with different rates for different paths", () => {
    limiter = createPathBasedRateLimiter({
      "/api/auth/": { maxRequests: 5, windowMs: 60000 },
      "/api/users/": { maxRequests: 100, windowMs: 60000 },
    });

    expect(limiter.check).toBeFunction();
    expect(limiter.stop).toBeFunction();
  });

  test("applies correct rate limit per path", () => {
    limiter = createPathBasedRateLimiter({
      "/api/auth/": { maxRequests: 2, windowMs: 60000 },
      "/api/users/": { maxRequests: 3, windowMs: 60000 },
    });

    const authRequest = new Request("http://localhost/api/auth/login", {
      headers: { "X-Forwarded-For": "6.6.6.1" },
    });

    const usersRequest = new Request("http://localhost/api/users/list", {
      headers: { "X-Forwarded-For": "6.6.6.1" },
    });

    // Auth: 2 requests allowed
    expect(limiter.check(authRequest)).toBeNull();
    expect(limiter.check(authRequest)).toBeNull();
    expect(limiter.check(authRequest)).not.toBeNull();

    // Users: 3 requests allowed
    expect(limiter.check(usersRequest)).toBeNull();
    expect(limiter.check(usersRequest)).toBeNull();
    expect(limiter.check(usersRequest)).toBeNull();
    expect(limiter.check(usersRequest)).not.toBeNull();
  });

  test("allows requests for non-configured paths", () => {
    limiter = createPathBasedRateLimiter({
      "/api/auth/": { maxRequests: 1, windowMs: 60000 },
    });

    const request = new Request("http://localhost/api/other/endpoint", {
      headers: { "X-Forwarded-For": "6.6.6.2" },
    });

    // Should not be rate limited
    expect(limiter.check(request)).toBeNull();
    expect(limiter.check(request)).toBeNull();
    expect(limiter.check(request)).toBeNull();
  });

  test("stops all cleanup intervals", () => {
    limiter = createPathBasedRateLimiter({
      "/api/auth/": { maxRequests: 5, windowMs: 60000 },
      "/api/users/": { maxRequests: 100, windowMs: 60000 },
      "/api/products/": { maxRequests: 50, windowMs: 60000 },
    });

    // Should not throw
    limiter.stop();
    limiter.stop();
  });

  test("returns 429 response for rate limited path", async () => {
    limiter = createPathBasedRateLimiter({
      "/api/strict/": { maxRequests: 1, windowMs: 60000 },
    });

    const request = new Request("http://localhost/api/strict/endpoint", {
      headers: { "X-Forwarded-For": "6.6.6.3" },
    });

    limiter.check(request);
    const result = limiter.check(request);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);

    const body = await result?.json();
    expect(body).toHaveProperty("error", "Too many requests");
  });

  test("applies first matching path", () => {
    limiter = createPathBasedRateLimiter({
      "/api/": { maxRequests: 10, windowMs: 60000 },
      "/api/auth/": { maxRequests: 2, windowMs: 60000 },
    });

    // Note: Map iteration order matches insertion order
    // /api/ matches first, so /api/auth/ uses /api/ limit
    const request = new Request("http://localhost/api/auth/login", {
      headers: { "X-Forwarded-For": "6.6.6.4" },
    });

    // The /api/ limit of 10 is applied
    for (let i = 0; i < 10; i++) {
      expect(limiter.check(request)).toBeNull();
    }
    expect(limiter.check(request)).not.toBeNull();
  });
});

describe("withRateLimit", () => {
  let middleware: RateLimitMiddleware | null = null;

  afterEach(() => {
    middleware?.stop();
    middleware = null;
  });

  test("allows requests under the limit", async () => {
    const handler = (): Response => {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    };

    const protectedHandler = withRateLimit(handler, {
      maxRequests: 5,
      windowMs: 60000,
    });

    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "7.7.7.1" },
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
  });

  test("adds rate limit headers to successful responses", async () => {
    const handler = (): Response => {
      return new Response("ok");
    };

    const protectedHandler = withRateLimit(handler, {
      maxRequests: 10,
      windowMs: 60000,
    });

    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "7.7.7.2" },
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  test("returns 429 when limit exceeded", async () => {
    const handler = (): Response => {
      return new Response("ok");
    };

    const protectedHandler = withRateLimit(handler, {
      maxRequests: 1,
      windowMs: 60000,
    });

    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "7.7.7.3" },
    });

    await protectedHandler(request); // First passes
    const response = await protectedHandler(request); // Second blocked

    expect(response.status).toBe(429);
  });

  test("works with async handlers", async () => {
    const asyncHandler = async (): Promise<Response> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ async: true }));
    };

    const protectedHandler = withRateLimit(asyncHandler, {
      maxRequests: 5,
      windowMs: 60000,
    });

    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "7.7.7.4" },
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ async: true });
  });

  test("preserves original response status", async () => {
    const handler = (): Response => {
      return new Response(null, { status: 201, statusText: "Created" });
    };

    const protectedHandler = withRateLimit(handler, {
      maxRequests: 10,
      windowMs: 60000,
    });

    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "7.7.7.5" },
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
  });

  test("preserves original response headers", async () => {
    const handler = (): Response => {
      return new Response("ok", {
        headers: {
          "X-Custom-Header": "custom-value",
          "Cache-Control": "no-cache",
        },
      });
    };

    const protectedHandler = withRateLimit(handler, {
      maxRequests: 10,
      windowMs: 60000,
    });

    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "7.7.7.6" },
    });

    const response = await protectedHandler(request);

    expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("RateLimitPresets", () => {
  test("exports auth preset", () => {
    expect(RateLimitPresets.auth).toBeDefined();
    expect(RateLimitPresets.auth.maxRequests).toBe(10);
    expect(RateLimitPresets.auth.windowMs).toBe(60000);
  });

  test("exports api preset", () => {
    expect(RateLimitPresets.api).toBeDefined();
    expect(RateLimitPresets.api.maxRequests).toBe(100);
    expect(RateLimitPresets.api.windowMs).toBe(60000);
  });

  test("exports strict preset", () => {
    expect(RateLimitPresets.strict).toBeDefined();
    expect(RateLimitPresets.strict.maxRequests).toBe(5);
    expect(RateLimitPresets.strict.windowMs).toBe(60000);
  });

  test("exports webhook preset", () => {
    expect(RateLimitPresets.webhook).toBeDefined();
    expect(RateLimitPresets.webhook.maxRequests).toBe(1000);
    expect(RateLimitPresets.webhook.windowMs).toBe(60000);
  });

  test("presets can be used with middleware", () => {
    const middleware = createRateLimitMiddleware(RateLimitPresets.auth);

    expect(middleware).toBeDefined();
    expect(typeof middleware.check).toBe("function");

    middleware.stop();
  });
});

describe("Rate limiting integration scenarios", () => {
  let middleware: RateLimitMiddleware;

  afterEach(() => {
    middleware?.stop();
  });

  test("protects authentication endpoints from brute force", async () => {
    middleware = createRateLimitMiddleware({
      maxRequests: 5,
      windowMs: 60000,
    });

    const attacker = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "X-Forwarded-For": "8.8.8.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "victim@example.com", password: "guess1" }),
    });

    // First 5 attempts pass
    for (let i = 0; i < 5; i++) {
      expect(middleware.check(attacker)).toBeNull();
    }

    // 6th attempt is blocked
    const result = middleware.check(attacker);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  test("different clients have separate limits", () => {
    middleware = createRateLimitMiddleware({
      maxRequests: 2,
      windowMs: 60000,
    });

    const client1 = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "9.9.9.1" },
    });

    const client2 = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "9.9.9.2" },
    });

    // Client 1 uses their limit
    expect(middleware.check(client1)).toBeNull();
    expect(middleware.check(client1)).toBeNull();
    expect(middleware.check(client1)).not.toBeNull();

    // Client 2 still has their own limit
    expect(middleware.check(client2)).toBeNull();
    expect(middleware.check(client2)).toBeNull();
    expect(middleware.check(client2)).not.toBeNull();
  });

  test("handles X-Forwarded-For with multiple IPs", () => {
    middleware = createRateLimitMiddleware({
      maxRequests: 1,
      windowMs: 60000,
    });

    // When request goes through multiple proxies
    const request = new Request("http://localhost/api/test", {
      headers: {
        "X-Forwarded-For": "10.0.0.1, 10.0.0.2, 10.0.0.3",
      },
    });

    // Should use first IP (original client)
    expect(middleware.check(request)).toBeNull();
    expect(middleware.check(request)).not.toBeNull();

    // Different original IP should have separate limit
    const request2 = new Request("http://localhost/api/test", {
      headers: {
        "X-Forwarded-For": "10.0.0.4, 10.0.0.2, 10.0.0.3",
      },
    });

    expect(middleware.check(request2)).toBeNull();
  });

  test("sliding window allows requests as time passes", async () => {
    middleware = createRateLimitMiddleware({
      maxRequests: 2,
      windowMs: 100, // 100ms window for testing
    });

    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "11.11.11.1" },
    });

    // Exhaust the limit
    expect(middleware.check(request)).toBeNull();
    expect(middleware.check(request)).toBeNull();
    expect(middleware.check(request)).not.toBeNull();

    // Wait for window to pass
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should be allowed again
    expect(middleware.check(request)).toBeNull();
  });
});
