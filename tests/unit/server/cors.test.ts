import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  createServer,
  getCorsHeaders,
  jsonWithCors,
  responseWithCors,
  preflightResponse,
} from "@/server";
import type { Config } from "@/config";

const testConfig: Config = {
  port: 0,
  nodeEnv: "test",
  syncEnabled: false,
  syncHour: 2,
  syncMinute: 0,
  syncBatchSize: 100,
  syncTenantDelay: 5000,
};

let serverInstance: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (serverInstance) {
    await serverInstance.stop(true);
    serverInstance = null;
  }
});

describe("getCorsHeaders", () => {
  const originalEnv = process.env.ALLOWED_ORIGIN;

  beforeEach(() => {
    delete process.env.ALLOWED_ORIGIN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOWED_ORIGIN = originalEnv;
    } else {
      delete process.env.ALLOWED_ORIGIN;
    }
  });

  test("returns default * origin when ALLOWED_ORIGIN is not set", () => {
    const headers = getCorsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  test("returns configured origin from ALLOWED_ORIGIN env var", () => {
    process.env.ALLOWED_ORIGIN = "https://example.com";
    const headers = getCorsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });

  test("includes all required CORS headers", () => {
    const headers = getCorsHeaders();
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });
});

describe("jsonWithCors", () => {
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
});

describe("responseWithCors", () => {
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
  test("returns 204 status", () => {
    const response = preflightResponse();
    expect(response.status).toBe(204);
  });

  test("includes all CORS headers", () => {
    const response = preflightResponse();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("returns null body", async () => {
    const response = preflightResponse();
    const body = await response.text();
    expect(body).toBe("");
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
});
