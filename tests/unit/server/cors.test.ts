import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  createServer,
  getCorsHeaders,
  jsonWithCors,
  responseWithCors,
  preflightResponse,
  configureCors,
  resetCorsConfig,
} from "@/server";
import { validateOrigin } from "@/api/routes/utils";
import type { Config } from "@/config";

const testConfig: Config = {
  port: 0,
  nodeEnv: "test",
  allowedOrigins: [],
  syncEnabled: false,
  syncHour: 2,
  syncMinute: 0,
  syncBatchSize: 100,
  syncTenantDelay: 5000,
  digestEnabled: false,
  digestHour: 8,
  digestMinute: 0,
  sentryEnvironment: "test",
  mercadoPagoPlanAmount: 9990,
  mercadoPagoPlanCurrency: "CLP",
  magicLinkExpiryMinutes: 15,
  magicLinkRateLimitPerHour: 5,
};

let serverInstance: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (serverInstance) {
    await serverInstance.stop(true);
    serverInstance = null;
  }
  // Reset CORS config after each test
  resetCorsConfig();
});

describe("validateOrigin", () => {
  beforeEach(() => {
    resetCorsConfig();
  });

  describe("in development/test mode without configured origins", () => {
    test("returns the request origin when provided", () => {
      configureCors({ allowedOrigins: [], nodeEnv: "test" });
      expect(validateOrigin("https://example.com")).toBe("https://example.com");
    });

    test("returns * when no origin is provided", () => {
      configureCors({ allowedOrigins: [], nodeEnv: "test" });
      expect(validateOrigin(null)).toBe("*");
    });

    test("returns * for development mode", () => {
      configureCors({ allowedOrigins: [], nodeEnv: "development" });
      expect(validateOrigin(null)).toBe("*");
    });
  });

  describe("in production mode without configured origins", () => {
    test("returns null (rejects) when no origins configured", () => {
      configureCors({ allowedOrigins: [], nodeEnv: "production" });
      expect(validateOrigin("https://example.com")).toBe(null);
    });

    test("returns null for null origin", () => {
      configureCors({ allowedOrigins: [], nodeEnv: "production" });
      expect(validateOrigin(null)).toBe(null);
    });
  });

  describe("with configured allowed origins", () => {
    beforeEach(() => {
      configureCors({
        allowedOrigins: ["https://allowed.com", "https://also-allowed.com"],
        nodeEnv: "production",
      });
    });

    test("returns the origin if it is in the allowed list", () => {
      expect(validateOrigin("https://allowed.com")).toBe("https://allowed.com");
      expect(validateOrigin("https://also-allowed.com")).toBe("https://also-allowed.com");
    });

    test("returns null for origins not in the allowed list", () => {
      expect(validateOrigin("https://not-allowed.com")).toBe(null);
      expect(validateOrigin("https://evil.com")).toBe(null);
    });

    test("returns first allowed origin for null (same-origin) requests", () => {
      expect(validateOrigin(null)).toBe("https://allowed.com");
    });
  });

  describe("edge cases", () => {
    test("handles empty string origin", () => {
      configureCors({
        allowedOrigins: ["https://allowed.com"],
        nodeEnv: "production",
      });
      // Empty string is not in the list, so it should be rejected
      expect(validateOrigin("")).toBe(null);
    });

    test("handles case-sensitive origin matching", () => {
      configureCors({
        allowedOrigins: ["https://Allowed.com"],
        nodeEnv: "production",
      });
      // Origins should be case-sensitive per spec
      expect(validateOrigin("https://Allowed.com")).toBe("https://Allowed.com");
      expect(validateOrigin("https://allowed.com")).toBe(null);
    });
  });
});

describe("getCorsHeaders", () => {
  beforeEach(() => {
    resetCorsConfig();
  });

  test("returns * origin in test mode when no origins configured", () => {
    configureCors({ allowedOrigins: [], nodeEnv: "test" });
    const headers = getCorsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  test("returns configured origin from allowed origins", () => {
    configureCors({
      allowedOrigins: ["https://example.com"],
      nodeEnv: "production",
    });
    const headers = getCorsHeaders("https://example.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });

  test("omits Access-Control-Allow-Origin for rejected origins in production", () => {
    configureCors({
      allowedOrigins: ["https://allowed.com"],
      nodeEnv: "production",
    });
    const headers = getCorsHeaders("https://not-allowed.com");
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  test("includes all required CORS headers for valid origins", () => {
    configureCors({ allowedOrigins: [], nodeEnv: "test" });
    const headers = getCorsHeaders();
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization, X-CSRF-Token");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  test("includes method and header info even for rejected origins", () => {
    configureCors({
      allowedOrigins: ["https://allowed.com"],
      nodeEnv: "production",
    });
    const headers = getCorsHeaders("https://not-allowed.com");
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization, X-CSRF-Token");
  });
});

describe("jsonWithCors", () => {
  beforeEach(() => {
    resetCorsConfig();
    configureCors({ allowedOrigins: [], nodeEnv: "test" });
  });

  test("creates JSON response with CORS headers", () => {
    const response = jsonWithCors({ foo: "bar" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  test("preserves custom headers while adding CORS", () => {
    const response = jsonWithCors({ foo: "bar" }, {
      headers: { "X-Custom-Header": "custom-value" },
    });
    expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("preserves status code", () => {
    const response = jsonWithCors({ error: "Not found" }, { status: 404 });
    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("returns valid JSON body", async () => {
    const data = { message: "test" };
    const response = jsonWithCors(data);
    const body = await response.json() as { message: string };
    expect(body).toEqual(data);
  });

  test("uses request origin when provided", () => {
    configureCors({
      allowedOrigins: ["https://my-app.com"],
      nodeEnv: "production",
    });
    const response = jsonWithCors({ data: "test" }, undefined, "https://my-app.com");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://my-app.com");
  });
});

describe("responseWithCors", () => {
  beforeEach(() => {
    resetCorsConfig();
    configureCors({ allowedOrigins: [], nodeEnv: "test" });
  });

  test("creates response with CORS headers", () => {
    const response = responseWithCors(null, { status: 204 });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.status).toBe(204);
  });

  test("preserves custom headers", () => {
    const response = responseWithCors("body", {
      headers: { "Content-Type": "text/plain" },
    });
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("preflightResponse", () => {
  beforeEach(() => {
    resetCorsConfig();
    configureCors({ allowedOrigins: [], nodeEnv: "test" });
  });

  test("returns 204 status", () => {
    const response = preflightResponse();
    expect(response.status).toBe(204);
  });

  test("includes all CORS headers", () => {
    const response = preflightResponse();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization, X-CSRF-Token");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("returns null body", async () => {
    const response = preflightResponse();
    const body = await response.text();
    expect(body).toBe("");
  });

  test("uses request origin when provided", () => {
    configureCors({
      allowedOrigins: ["https://my-app.com"],
      nodeEnv: "production",
    });
    const response = preflightResponse("https://my-app.com");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://my-app.com");
  });
});

describe("CORS integration with server", () => {
  test("OPTIONS request returns preflight response", async () => {
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/health`, {
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
  });

  test("GET /api/health includes CORS headers", async () => {
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("GET /api/alerts includes CORS headers", async () => {
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/alerts`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("POST /api/auth/login includes CORS headers", async () => {
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Set-Cookie")).toContain("session_token=");
  });

  test("unknown API routes return 404 with CORS headers", async () => {
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/unknown-route`);

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("DELETE /api/thresholds/:id returns 204 with CORS headers", async () => {
    serverInstance = createServer(testConfig);
    // First create a threshold to delete (to avoid test pollution)
    const createResponse = await fetch(`http://localhost:${String(serverInstance.port)}/api/thresholds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "p1", minQuantity: 999 }),
    });
    const created = await createResponse.json() as { id: string };

    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/thresholds/${created.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("OPTIONS request to any API path returns preflight", async () => {
    serverInstance = createServer(testConfig);
    const paths = ["/api/alerts", "/api/products", "/api/settings", "/api/auth/me"];

    for (const path of paths) {
      const response = await fetch(`http://localhost:${String(serverInstance.port)}${path}`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  test("server with configured origins validates request origin", async () => {
    const configWithOrigins: Config = {
      ...testConfig,
      allowedOrigins: ["https://allowed.com"],
      nodeEnv: "production",
    };
    serverInstance = createServer(configWithOrigins);

    // Request with allowed origin
    const allowedResponse = await fetch(`http://localhost:${String(serverInstance.port)}/api/health`, {
      headers: { "Origin": "https://allowed.com" },
    });
    expect(allowedResponse.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.com");

    // Request with disallowed origin
    const disallowedResponse = await fetch(`http://localhost:${String(serverInstance.port)}/api/health`, {
      headers: { "Origin": "https://evil.com" },
    });
    // No Access-Control-Allow-Origin header means browser will block
    expect(disallowedResponse.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("resetCorsConfig", () => {
  test("clears configured CORS settings", () => {
    configureCors({
      allowedOrigins: ["https://example.com"],
      nodeEnv: "production",
    });

    // Verify config is set
    const headersBefore = getCorsHeaders("https://example.com");
    expect(headersBefore["Access-Control-Allow-Origin"]).toBe("https://example.com");

    // Reset
    resetCorsConfig();

    // After reset, should fall back to env var parsing (which defaults to test mode behavior)
    const headersAfter = getCorsHeaders("https://example.com");
    expect(headersAfter["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });
});
