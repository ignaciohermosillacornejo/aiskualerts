/* eslint-disable @typescript-eslint/await-thenable */
import { test, expect, describe, beforeEach } from "bun:test";
import {
  createCSRFMiddleware,
  withCSRFProtection,
  addCSRFCookie,
  responseWithCSRF,
  type CSRFMiddleware,
  type CSRFMiddlewareConfig,
} from "../../../../src/api/middleware/csrf";

// Test secret - 32+ characters as required
const TEST_SECRET = "test-csrf-secret-that-is-at-least-32-characters-long";

describe("CSRF Middleware", () => {
  let middleware: CSRFMiddleware;
  let config: CSRFMiddlewareConfig;

  beforeEach(() => {
    config = {
      secret: TEST_SECRET,
    };
    middleware = createCSRFMiddleware(config);
  });

  describe("createCSRFMiddleware", () => {
    test("creates middleware with default configuration", () => {
      const mw = createCSRFMiddleware({ secret: TEST_SECRET });

      expect(typeof mw.validate).toBe("function");
      expect(typeof mw.generateToken).toBe("function");
      expect(typeof mw.createCookie).toBe("function");
      expect(typeof mw.getService).toBe("function");
      expect(typeof mw.getHeaderName).toBe("function");
      expect(typeof mw.getCookieName).toBe("function");
    });

    test("returns default header name X-CSRF-Token", () => {
      expect(middleware.getHeaderName()).toBe("X-CSRF-Token");
    });

    test("returns default cookie name csrf_token", () => {
      expect(middleware.getCookieName()).toBe("csrf_token");
    });

    test("uses custom header name when configured", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        headerName: "X-Custom-CSRF",
      });

      expect(mw.getHeaderName()).toBe("X-Custom-CSRF");
    });

    test("uses custom cookie name when configured", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        cookieName: "my_csrf_cookie",
      });

      expect(mw.getCookieName()).toBe("my_csrf_cookie");
    });

    test("generates valid tokens", () => {
      const token = middleware.generateToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
      // Token format: timestamp.randomData.signature (3 parts)
      expect(token.split(".").length).toBe(3);
    });

    test("creates cookie with token", () => {
      const token = middleware.generateToken();
      const cookie = middleware.createCookie(token);

      expect(cookie).toContain(`csrf_token=${token}`);
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("SameSite=Strict");
    });

    test("exposes underlying service", () => {
      const service = middleware.getService();

      expect(service).toBeDefined();
      expect(typeof service.generateToken).toBe("function");
      expect(typeof service.validateToken).toBe("function");
    });
  });

  describe("validate", () => {
    test("skips validation for GET requests", () => {
      const request = new Request("http://localhost/api/test", {
        method: "GET",
      });

      const result = middleware.validate(request);

      expect(result).toBeNull();
    });

    test("skips validation for HEAD requests", () => {
      const request = new Request("http://localhost/api/test", {
        method: "HEAD",
      });

      const result = middleware.validate(request);

      expect(result).toBeNull();
    });

    test("skips validation for OPTIONS requests", () => {
      const request = new Request("http://localhost/api/test", {
        method: "OPTIONS",
      });

      const result = middleware.validate(request);

      expect(result).toBeNull();
    });

    test("requires validation for POST requests", () => {
      const request = new Request("http://localhost/api/test", {
        method: "POST",
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("requires validation for PUT requests", () => {
      const request = new Request("http://localhost/api/test", {
        method: "PUT",
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("requires validation for DELETE requests", () => {
      const request = new Request("http://localhost/api/test", {
        method: "DELETE",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("requires validation for PATCH requests", () => {
      const request = new Request("http://localhost/api/test", {
        method: "PATCH",
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("returns 403 error response with correct format", async () => {
      const request = new Request("http://localhost/api/test", {
        method: "POST",
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);

      const body = await result?.json();
      expect(body).toEqual({ error: "CSRF token validation failed" });
    });

    test("passes validation with valid token in cookie and header", () => {
      const token = middleware.generateToken();
      const cookieName = middleware.getCookieName();
      const headerName = middleware.getHeaderName();

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          Cookie: `${cookieName}=${token}`,
          [headerName]: token,
        },
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).toBeNull();
    });

    test("fails validation when header is missing", () => {
      const token = middleware.generateToken();
      const cookieName = middleware.getCookieName();

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          Cookie: `${cookieName}=${token}`,
        },
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("fails validation when cookie is missing", () => {
      const token = middleware.generateToken();
      const headerName = middleware.getHeaderName();

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          [headerName]: token,
        },
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("fails validation when tokens do not match", () => {
      const token1 = middleware.generateToken();
      const token2 = middleware.generateToken();
      const cookieName = middleware.getCookieName();
      const headerName = middleware.getHeaderName();

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          Cookie: `${cookieName}=${token1}`,
          [headerName]: token2,
        },
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("fails validation with invalid/forged token", () => {
      const invalidToken = "fake.token.signature";
      const cookieName = middleware.getCookieName();
      const headerName = middleware.getHeaderName();

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          Cookie: `${cookieName}=${invalidToken}`,
          [headerName]: invalidToken,
        },
        body: "{}",
      });

      const result = middleware.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });
  });

  describe("path exclusions", () => {
    test("skips validation for excluded paths", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        excludePaths: ["/api/webhooks/", "/api/public/"],
      });

      const request = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      });

      const result = mw.validate(request);

      expect(result).toBeNull();
    });

    test("skips validation for paths starting with excluded prefix", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        excludePaths: ["/api/webhooks/"],
      });

      const request = new Request("http://localhost/api/webhooks/stripe/events", {
        method: "POST",
        body: "{}",
      });

      const result = mw.validate(request);

      expect(result).toBeNull();
    });

    test("requires validation for paths not in exclusion list", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        excludePaths: ["/api/webhooks/"],
      });

      const request = new Request("http://localhost/api/users", {
        method: "POST",
        body: "{}",
      });

      const result = mw.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    test("handles multiple excluded paths correctly", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        excludePaths: ["/api/webhooks/", "/api/public/", "/api/auth/bsale/"],
      });

      const requests = [
        new Request("http://localhost/api/webhooks/test", { method: "POST", body: "{}" }),
        new Request("http://localhost/api/public/health", { method: "POST", body: "{}" }),
        new Request("http://localhost/api/auth/bsale/callback", { method: "POST", body: "{}" }),
      ];

      for (const req of requests) {
        const result = mw.validate(req);
        expect(result).toBeNull();
      }
    });

    test("handles empty excludePaths array", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        excludePaths: [],
      });

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        body: "{}",
      });

      const result = mw.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });
  });

  describe("custom protected methods", () => {
    test("validates only specified methods", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        protectedMethods: ["POST", "DELETE"],
      });

      // PUT should be skipped
      const putRequest = new Request("http://localhost/api/test", {
        method: "PUT",
        body: "{}",
      });

      expect(mw.validate(putRequest)).toBeNull();

      // POST should require validation
      const postRequest = new Request("http://localhost/api/test", {
        method: "POST",
        body: "{}",
      });

      expect(mw.validate(postRequest)).not.toBeNull();

      // DELETE should require validation
      const deleteRequest = new Request("http://localhost/api/test", {
        method: "DELETE",
      });

      expect(mw.validate(deleteRequest)).not.toBeNull();
    });

    test("handles empty protectedMethods array", () => {
      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        protectedMethods: [],
      });

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        body: "{}",
      });

      const result = mw.validate(request);

      expect(result).toBeNull();
    });
  });

  describe("custom validation failure handler", () => {
    test("uses custom handler when validation fails", async () => {
      const customHandler = (): Response => {
        return new Response(JSON.stringify({ customError: "Token invalid" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      };

      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        onValidationFailed: customHandler,
      });

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        body: "{}",
      });

      const result = mw.validate(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);

      const body = await result?.json();
      expect(body).toEqual({ customError: "Token invalid" });
    });

    test("custom handler receives request object", async () => {
      let capturedUrl = "";

      const customHandler = (req: Request): Response => {
        capturedUrl = req.url;
        return new Response("error", { status: 403 });
      };

      const mw = createCSRFMiddleware({
        secret: TEST_SECRET,
        onValidationFailed: customHandler,
      });

      const request = new Request("http://localhost/api/special/path", {
        method: "POST",
        body: "{}",
      });

      mw.validate(request);

      expect(capturedUrl).toBe("http://localhost/api/special/path");
    });
  });
});

describe("withCSRFProtection", () => {
  test("allows request with valid CSRF token", async () => {
    const handler = (): Response => {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    };

    const config: CSRFMiddlewareConfig = { secret: TEST_SECRET };
    const protectedHandler = withCSRFProtection(handler, config);
    const middleware = createCSRFMiddleware(config);

    const token = middleware.generateToken();

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        Cookie: `csrf_token=${token}`,
        "X-CSRF-Token": token,
      },
      body: "{}",
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
  });

  test("blocks request without CSRF token", async () => {
    const handler = (): Response => {
      return new Response(JSON.stringify({ success: true }));
    };

    const protectedHandler = withCSRFProtection(handler, { secret: TEST_SECRET });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{}",
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: "CSRF token validation failed" });
  });

  test("skips CSRF for GET requests", async () => {
    const handler = (): Response => {
      return new Response(JSON.stringify({ data: "test" }));
    };

    const protectedHandler = withCSRFProtection(handler, { secret: TEST_SECRET });

    const request = new Request("http://localhost/api/test", {
      method: "GET",
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: "test" });
  });

  test("respects path exclusions", async () => {
    const handler = (): Response => {
      return new Response(JSON.stringify({ webhook: "received" }));
    };

    const protectedHandler = withCSRFProtection(handler, {
      secret: TEST_SECRET,
      excludePaths: ["/api/webhooks/"],
    });

    const request = new Request("http://localhost/api/webhooks/test", {
      method: "POST",
      body: "{}",
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ webhook: "received" });
  });

  test("works with async handlers", async () => {
    const asyncHandler = async (): Promise<Response> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ async: true }));
    };

    const config: CSRFMiddlewareConfig = { secret: TEST_SECRET };
    const protectedHandler = withCSRFProtection(asyncHandler, config);
    const middleware = createCSRFMiddleware(config);

    const token = middleware.generateToken();

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        Cookie: `csrf_token=${token}`,
        "X-CSRF-Token": token,
      },
      body: "{}",
    });

    const response = await protectedHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ async: true });
  });
});

describe("addCSRFCookie", () => {
  test("adds CSRF cookie to existing response", () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });
    const originalResponse = new Response(JSON.stringify({ data: "test" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const responseWithCookie = addCSRFCookie(originalResponse, middleware);

    expect(responseWithCookie.status).toBe(200);
    expect(responseWithCookie.headers.get("Set-Cookie")).toContain("csrf_token=");
    expect(responseWithCookie.headers.get("Content-Type")).toBe("application/json");
  });

  test("preserves original response status", () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });
    const originalResponse = new Response(null, {
      status: 201,
      statusText: "Created",
    });

    const responseWithCookie = addCSRFCookie(originalResponse, middleware);

    expect(responseWithCookie.status).toBe(201);
    expect(responseWithCookie.statusText).toBe("Created");
  });

  test("preserves original response headers", () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });
    const originalResponse = new Response("test", {
      headers: {
        "X-Custom-Header": "custom-value",
        "Cache-Control": "no-cache",
      },
    });

    const responseWithCookie = addCSRFCookie(originalResponse, middleware);

    expect(responseWithCookie.headers.get("X-Custom-Header")).toBe("custom-value");
    expect(responseWithCookie.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("responseWithCSRF", () => {
  test("creates response with CSRF cookie", () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });
    const response = responseWithCSRF(
      JSON.stringify({ login: "success" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
      middleware
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("csrf_token=");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  test("handles null body", () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });
    const response = responseWithCSRF(null, { status: 204 }, middleware);

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain("csrf_token=");
  });

  test("handles undefined init", () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });
    const response = responseWithCSRF("test body", undefined, middleware);

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("csrf_token=");
  });

  test("generates unique token for each call", () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });

    const response1 = responseWithCSRF("test", {}, middleware);
    const response2 = responseWithCSRF("test", {}, middleware);

    const cookie1 = response1.headers.get("Set-Cookie");
    const cookie2 = response2.headers.get("Set-Cookie");

    // Extract token from cookies (format: csrf_token=TOKEN; Path=/; ...)
    const token1 = cookie1?.split(";")[0]?.split("=")[1];
    const token2 = cookie2?.split(";")[0]?.split("=")[1];

    expect(token1).not.toBe(token2);
  });
});

describe("CSRF integration scenarios", () => {
  test("complete login flow with CSRF protection", async () => {
    const config: CSRFMiddlewareConfig = { secret: TEST_SECRET };
    const middleware = createCSRFMiddleware(config);

    // Step 1: User loads login page (GET) - no CSRF needed
    const getRequest = new Request("http://localhost/login", { method: "GET" });
    expect(middleware.validate(getRequest)).toBeNull();

    // Step 2: Server includes CSRF token in response
    const loginPageResponse = responseWithCSRF(
      "<html>login form</html>",
      { headers: { "Content-Type": "text/html" } },
      middleware
    );

    // Extract token from Set-Cookie header
    const setCookie = loginPageResponse.headers.get("Set-Cookie");
    expect(setCookie).toBeDefined();
    const cookiePart = setCookie?.split(";")[0];
    const token = cookiePart?.split("=")[1] ?? "";
    expect(token.length).toBeGreaterThan(0);

    // Step 3: User submits login form (POST) with CSRF token
    const loginRequest = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        Cookie: `csrf_token=${token}`,
        "X-CSRF-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "test@example.com", password: "secret" }),
    });

    // Validation should pass
    expect(middleware.validate(loginRequest)).toBeNull();
  });

  test("API request without token is rejected", async () => {
    const middleware = createCSRFMiddleware({ secret: TEST_SECRET });

    // Attacker tries to make request without CSRF token
    const maliciousRequest = new Request("http://localhost/api/users/delete", {
      method: "DELETE",
    });

    const result = middleware.validate(maliciousRequest);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  test("token from different server is rejected", () => {
    // Server 1 generates token
    const server1Middleware = createCSRFMiddleware({
      secret: "server-1-secret-that-is-at-least-32-chars-long",
    });
    const server1Token = server1Middleware.generateToken();

    // Server 2 validates token - should fail
    const server2Middleware = createCSRFMiddleware({
      secret: "server-2-secret-that-is-at-least-32-chars-long",
    });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        Cookie: `csrf_token=${server1Token}`,
        "X-CSRF-Token": server1Token,
      },
      body: "{}",
    });

    const result = server2Middleware.validate(request);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});
