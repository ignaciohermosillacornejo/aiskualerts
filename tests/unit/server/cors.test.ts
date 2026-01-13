import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  createServer,
  getCorsHeaders,
  jsonWithCors,
  responseWithCors,
  preflightResponse,
  validateOrigin,
  shouldRejectCorsRequest,
  corsRejectionResponse,
} from "@/server";
import type { Config } from "@/config";

// Helper constant for NODE_ENV access (workaround for eslint dot-notation rule)
const NODE_ENV_KEY = "NODE_ENV" as const;

const testConfig: Config = {
  port: 0,
  nodeEnv: "test",
  syncEnabled: false,
  syncHour: 2,
  syncMinute: 0,
  syncBatchSize: 100,
  syncTenantDelay: 5000,
  digestEnabled: false,
  digestHour: 8,
  digestMinute: 0,
  sentryEnvironment: "test",
};

let serverInstance: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (serverInstance) {
    await serverInstance.stop(true);
    serverInstance = null;
  }
});

describe("validateOrigin", () => {
  const originalEnvOrigin = process.env["ALLOWED_ORIGIN"];
  const originalEnvOrigins = process.env["ALLOWED_ORIGINS"];
  const originalNodeEnv = process.env[NODE_ENV_KEY];

  beforeEach(() => {
    delete process.env["ALLOWED_ORIGIN"];
    delete process.env["ALLOWED_ORIGINS"];
  });

  afterEach(() => {
    if (originalEnvOrigin !== undefined) {
      process.env["ALLOWED_ORIGIN"] = originalEnvOrigin;
    } else {
      delete process.env["ALLOWED_ORIGIN"];
    }
    if (originalEnvOrigins !== undefined) {
      process.env["ALLOWED_ORIGINS"] = originalEnvOrigins;
    } else {
      delete process.env["ALLOWED_ORIGINS"];
    }
    if (originalNodeEnv !== undefined) {
      process.env[NODE_ENV_KEY] = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, NODE_ENV_KEY);
    }
  });

  test("returns * when no origins configured in non-production", () => {
    process.env[NODE_ENV_KEY] = "test";
    const origin = validateOrigin(null);
    expect(origin).toBe("*");
  });

  test("returns null when no origins configured in production", () => {
    process.env[NODE_ENV_KEY] = "production";
    const origin = validateOrigin(null);
    expect(origin).toBeNull();
  });

  test("returns first allowed origin when request has no Origin header", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com";
    const req = new Request("http://localhost/api/test");
    const origin = validateOrigin(req);
    expect(origin).toBe("https://example.com");
  });

  test("returns request origin when it matches allowed origins", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com,https://other.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://other.com" },
    });
    const origin = validateOrigin(req);
    expect(origin).toBe("https://other.com");
  });

  test("returns null when request origin does not match allowed origins", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://malicious.com" },
    });
    const origin = validateOrigin(req);
    expect(origin).toBeNull();
  });

  test("supports legacy ALLOWED_ORIGIN env var", () => {
    process.env["ALLOWED_ORIGIN"] = "https://legacy.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://legacy.com" },
    });
    const origin = validateOrigin(req);
    expect(origin).toBe("https://legacy.com");
  });

  test("ALLOWED_ORIGINS takes precedence over ALLOWED_ORIGIN", () => {
    process.env["ALLOWED_ORIGIN"] = "https://legacy.com";
    process.env["ALLOWED_ORIGINS"] = "https://new.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://new.com" },
    });
    const origin = validateOrigin(req);
    expect(origin).toBe("https://new.com");
  });

  test("handles comma-separated origins with whitespace", () => {
    process.env["ALLOWED_ORIGINS"] = "https://a.com, https://b.com , https://c.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://b.com" },
    });
    const origin = validateOrigin(req);
    expect(origin).toBe("https://b.com");
  });
});

describe("shouldRejectCorsRequest", () => {
  const originalEnvOrigins = process.env["ALLOWED_ORIGINS"];
  const originalNodeEnv = process.env[NODE_ENV_KEY];

  beforeEach(() => {
    delete process.env["ALLOWED_ORIGINS"];
  });

  afterEach(() => {
    if (originalEnvOrigins !== undefined) {
      process.env["ALLOWED_ORIGINS"] = originalEnvOrigins;
    } else {
      delete process.env["ALLOWED_ORIGINS"];
    }
    if (originalNodeEnv !== undefined) {
      process.env[NODE_ENV_KEY] = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, NODE_ENV_KEY);
    }
  });

  test("returns true for cross-origin request from unknown origin", () => {
    process.env["ALLOWED_ORIGINS"] = "https://allowed.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://unknown.com" },
    });
    expect(shouldRejectCorsRequest(req)).toBe(true);
  });

  test("returns false for cross-origin request from allowed origin", () => {
    process.env["ALLOWED_ORIGINS"] = "https://allowed.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://allowed.com" },
    });
    expect(shouldRejectCorsRequest(req)).toBe(false);
  });

  test("returns false for same-origin request (no Origin header)", () => {
    process.env["ALLOWED_ORIGINS"] = "https://allowed.com";
    const req = new Request("http://localhost/api/test");
    expect(shouldRejectCorsRequest(req)).toBe(false);
  });

  test("returns false in non-production when no origins configured", () => {
    process.env[NODE_ENV_KEY] = "test";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://any.com" },
    });
    expect(shouldRejectCorsRequest(req)).toBe(false);
  });

  test("returns true in production when no origins configured", () => {
    process.env[NODE_ENV_KEY] = "production";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://any.com" },
    });
    expect(shouldRejectCorsRequest(req)).toBe(true);
  });
});

describe("corsRejectionResponse", () => {
  test("returns 403 status", () => {
    const response = corsRejectionResponse();
    expect(response.status).toBe(403);
  });

  test("returns JSON error message", async () => {
    const response = corsRejectionResponse();
    const body = await response.json() as { error: string };
    expect(body.error).toBe("Origin not allowed");
  });
});

describe("getCorsHeaders", () => {
  const originalEnv = process.env["ALLOWED_ORIGINS"];
  const originalNodeEnv = process.env[NODE_ENV_KEY];

  beforeEach(() => {
    delete process.env["ALLOWED_ORIGINS"];
    delete process.env["ALLOWED_ORIGIN"];
    process.env[NODE_ENV_KEY] = "test";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["ALLOWED_ORIGINS"] = originalEnv;
    } else {
      delete process.env["ALLOWED_ORIGINS"];
    }
    if (originalNodeEnv !== undefined) {
      process.env[NODE_ENV_KEY] = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, NODE_ENV_KEY);
    }
  });

  test("returns * origin in test environment when no origins configured", () => {
    const headers = getCorsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  test("returns configured origin from ALLOWED_ORIGINS env var", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://example.com" },
    });
    const headers = getCorsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });

  test("includes all required CORS headers", () => {
    const headers = getCorsHeaders();
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization, X-CSRF-Token");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  test("includes Vary header for dynamic origins", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://example.com" },
    });
    const headers = getCorsHeaders(req);
    expect(headers["Vary"]).toBe("Origin");
  });

  test("does not include Vary header for wildcard origin", () => {
    const headers = getCorsHeaders();
    expect(headers["Vary"]).toBeUndefined();
  });
});

describe("jsonWithCors", () => {
  const originalEnv = process.env["ALLOWED_ORIGINS"];
  const originalNodeEnv = process.env[NODE_ENV_KEY];

  beforeEach(() => {
    delete process.env["ALLOWED_ORIGINS"];
    process.env[NODE_ENV_KEY] = "test";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["ALLOWED_ORIGINS"] = originalEnv;
    } else {
      delete process.env["ALLOWED_ORIGINS"];
    }
    if (originalNodeEnv !== undefined) {
      process.env[NODE_ENV_KEY] = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, NODE_ENV_KEY);
    }
  });

  test("creates JSON response with CORS headers", () => {
    const response = jsonWithCors({ foo: "bar" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  test("uses request origin when provided", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://example.com" },
    });
    const response = jsonWithCors({ foo: "bar" }, undefined, req);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
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
});

describe("responseWithCors", () => {
  const originalEnv = process.env["ALLOWED_ORIGINS"];
  const originalNodeEnv = process.env[NODE_ENV_KEY];

  beforeEach(() => {
    delete process.env["ALLOWED_ORIGINS"];
    process.env[NODE_ENV_KEY] = "test";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["ALLOWED_ORIGINS"] = originalEnv;
    } else {
      delete process.env["ALLOWED_ORIGINS"];
    }
    if (originalNodeEnv !== undefined) {
      process.env[NODE_ENV_KEY] = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, NODE_ENV_KEY);
    }
  });

  test("creates response with CORS headers", () => {
    const response = responseWithCors(null, { status: 204 });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.status).toBe(204);
  });

  test("uses request origin when provided", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com";
    const req = new Request("http://localhost/api/test", {
      headers: { Origin: "https://example.com" },
    });
    const response = responseWithCors(null, { status: 204 }, req);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
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
  const originalEnv = process.env["ALLOWED_ORIGINS"];
  const originalNodeEnv = process.env[NODE_ENV_KEY];

  beforeEach(() => {
    delete process.env["ALLOWED_ORIGINS"];
    process.env[NODE_ENV_KEY] = "test";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["ALLOWED_ORIGINS"] = originalEnv;
    } else {
      delete process.env["ALLOWED_ORIGINS"];
    }
    if (originalNodeEnv !== undefined) {
      process.env[NODE_ENV_KEY] = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, NODE_ENV_KEY);
    }
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

  test("uses request origin when provided", () => {
    process.env["ALLOWED_ORIGINS"] = "https://example.com";
    const req = new Request("http://localhost/api/test", {
      method: "OPTIONS",
      headers: { Origin: "https://example.com" },
    });
    const response = preflightResponse(req);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  test("returns null body", async () => {
    const response = preflightResponse();
    const body = await response.text();
    expect(body).toBe("");
  });
});

describe("CORS integration with server", () => {
  const originalEnv = process.env["ALLOWED_ORIGINS"];
  const originalNodeEnv = process.env[NODE_ENV_KEY];

  beforeEach(() => {
    delete process.env["ALLOWED_ORIGINS"];
    process.env[NODE_ENV_KEY] = "test";
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop(true);
      serverInstance = null;
    }
    if (originalEnv !== undefined) {
      process.env["ALLOWED_ORIGINS"] = originalEnv;
    } else {
      delete process.env["ALLOWED_ORIGINS"];
    }
    if (originalNodeEnv !== undefined) {
      process.env[NODE_ENV_KEY] = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, NODE_ENV_KEY);
    }
  });

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

  test("cross-origin request with valid origin succeeds", async () => {
    process.env["ALLOWED_ORIGINS"] = "https://allowed.com";
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/health`, {
      headers: { Origin: "https://allowed.com" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.com");
  });

  test("cross-origin request with invalid origin returns empty CORS header (browser will reject)", async () => {
    process.env[NODE_ENV_KEY] = "test";
    process.env["ALLOWED_ORIGINS"] = "https://allowed.com";
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/alerts`, {
      headers: { Origin: "https://malicious.com" },
    });

    // For routes in the routes object, invalid origins get responses with empty
    // Access-Control-Allow-Origin header, which browsers will reject via CORS enforcement
    expect(response.status).toBe(200); // Server still responds
    // Header may be empty string or null depending on browser/server implementation
    const allowOrigin = response.headers.get("Access-Control-Allow-Origin");
    expect(allowOrigin === "" || allowOrigin === null).toBe(true); // CORS header is empty/null
  });

  test("cross-origin request with invalid origin to fallback routes is rejected with 403", async () => {
    process.env[NODE_ENV_KEY] = "test";
    process.env["ALLOWED_ORIGINS"] = "https://allowed.com";
    serverInstance = createServer(testConfig);
    // This route goes through the fetch handler fallback, which explicitly rejects
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/unknown-route`, {
      headers: { Origin: "https://malicious.com" },
    });

    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("Origin not allowed");
  });

  test("same-origin requests (no Origin header) succeed", async () => {
    process.env["ALLOWED_ORIGINS"] = "https://allowed.com";
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/health`);

    expect(response.status).toBe(200);
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
});
