import { test, expect, afterEach, describe, mock, type Mock } from "bun:test";
import {
  createServer,
  createHealthResponse,
  getCorsHeaders,
  jsonWithCors,
  responseWithCors,
  preflightResponse,
  withErrorBoundary,
  CreateThresholdSchema,
  UpdateThresholdSchema,
  UpdateSettingsSchema,
  LoginSchema,
  startServer,
  type HealthResponse,
  type ServerDependencies,
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
  sentryEnvironment: "test",
};

let serverInstance: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (serverInstance) {
    await serverInstance.stop(true);
    serverInstance = null;
  }
});

describe("CORS Helpers", () => {
  describe("getCorsHeaders", () => {
    test("returns required CORS headers", () => {
      const headers = getCorsHeaders();
      expect(headers["Access-Control-Allow-Origin"]).toBeDefined();
      expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");
      expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization, X-CSRF-Token");
      expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    });

    test("uses ALLOWED_ORIGIN env variable when set", () => {
      const originalOrigin = process.env["ALLOWED_ORIGIN"];
      process.env["ALLOWED_ORIGIN"] = "https://example.com";

      const headers = getCorsHeaders();
      expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");

      if (originalOrigin !== undefined) {
        process.env["ALLOWED_ORIGIN"] = originalOrigin;
      } else {
        delete process.env["ALLOWED_ORIGIN"];
      }
    });

    test("uses wildcard when ALLOWED_ORIGIN not set", () => {
      const originalOrigin = process.env["ALLOWED_ORIGIN"];
      delete process.env["ALLOWED_ORIGIN"];

      const headers = getCorsHeaders();
      expect(headers["Access-Control-Allow-Origin"]).toBe("*");

      if (originalOrigin !== undefined) {
        process.env["ALLOWED_ORIGIN"] = originalOrigin;
      }
    });
  });

  describe("jsonWithCors", () => {
    test("creates JSON response with CORS headers", async () => {
      const response = jsonWithCors({ data: "test" });
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
      const body = (await response.json()) as { data: string };
      expect(body.data).toBe("test");
    });

    test("accepts custom status code", () => {
      const response = jsonWithCors({ error: "Not found" }, { status: 404 });
      expect(response.status).toBe(404);
    });

    test("merges provided headers with CORS headers", () => {
      const response = jsonWithCors({ data: "test" }, { headers: { "X-Custom": "value" } });
      expect(response.headers.get("X-Custom")).toBe("value");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    });
  });

  describe("responseWithCors", () => {
    test("creates response with CORS headers", () => {
      const response = responseWithCors("test body");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    });

    test("accepts null body", () => {
      const response = responseWithCors(null, { status: 204 });
      expect(response.status).toBe(204);
    });

    test("merges provided headers", () => {
      const response = responseWithCors("body", { headers: { "X-Custom": "header" } });
      expect(response.headers.get("X-Custom")).toBe("header");
    });
  });

  describe("preflightResponse", () => {
    test("returns 204 status", () => {
      const response = preflightResponse();
      expect(response.status).toBe(204);
    });

    test("includes CORS headers", () => {
      const response = preflightResponse();
      expect(response.headers.get("Access-Control-Allow-Methods")).toBeDefined();
    });
  });
});

describe("Validation Schemas", () => {
  describe("CreateThresholdSchema", () => {
    test("validates valid threshold data", () => {
      const result = CreateThresholdSchema.safeParse({
        productId: "p1",
        minQuantity: 10,
      });
      expect(result.success).toBe(true);
    });

    test("rejects empty productId", () => {
      const result = CreateThresholdSchema.safeParse({
        productId: "",
        minQuantity: 10,
      });
      expect(result.success).toBe(false);
    });

    test("rejects negative minQuantity", () => {
      const result = CreateThresholdSchema.safeParse({
        productId: "p1",
        minQuantity: -5,
      });
      expect(result.success).toBe(false);
    });

    test("rejects non-integer minQuantity", () => {
      const result = CreateThresholdSchema.safeParse({
        productId: "p1",
        minQuantity: 10.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateThresholdSchema", () => {
    test("validates valid update data", () => {
      const result = UpdateThresholdSchema.safeParse({ minQuantity: 15 });
      expect(result.success).toBe(true);
    });

    test("rejects negative minQuantity", () => {
      const result = UpdateThresholdSchema.safeParse({ minQuantity: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateSettingsSchema", () => {
    test("validates valid settings data", () => {
      const result = UpdateSettingsSchema.safeParse({
        companyName: "Test Co",
        emailNotifications: true,
        syncFrequency: "hourly",
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid email format", () => {
      const result = UpdateSettingsSchema.safeParse({
        email: "invalid-email",
      });
      expect(result.success).toBe(false);
    });

    test("rejects invalid notification email", () => {
      const result = UpdateSettingsSchema.safeParse({
        notificationEmail: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    test("rejects invalid sync frequency", () => {
      const result = UpdateSettingsSchema.safeParse({
        syncFrequency: "monthly",
      });
      expect(result.success).toBe(false);
    });

    test("accepts valid sync frequencies", () => {
      expect(UpdateSettingsSchema.safeParse({ syncFrequency: "hourly" }).success).toBe(true);
      expect(UpdateSettingsSchema.safeParse({ syncFrequency: "daily" }).success).toBe(true);
      expect(UpdateSettingsSchema.safeParse({ syncFrequency: "weekly" }).success).toBe(true);
    });
  });

  describe("LoginSchema", () => {
    test("validates valid login data", () => {
      const result = LoginSchema.safeParse({
        email: "test@example.com",
        password: "secret123",
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid email", () => {
      const result = LoginSchema.safeParse({
        email: "not-valid",
        password: "secret",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty password", () => {
      const result = LoginSchema.safeParse({
        email: "test@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("createHealthResponse", () => {
  test("returns status ok", () => {
    const response = createHealthResponse();
    expect(response.status).toBe("ok");
  });

  test("returns valid ISO timestamp", () => {
    const before = new Date().toISOString();
    const response = createHealthResponse();
    const after = new Date().toISOString();

    expect(response.timestamp).toBeDefined();
    expect(response.timestamp >= before).toBe(true);
    expect(response.timestamp <= after).toBe(true);
  });

  test("returns correctly typed response", () => {
    const response: HealthResponse = createHealthResponse();
    expect(response).toHaveProperty("status");
    expect(response).toHaveProperty("timestamp");
  });
});

describe("createServer", () => {
  test("creates a server instance", () => {
    serverInstance = createServer(testConfig);
    expect(serverInstance).toBeDefined();
    expect(serverInstance.port).toBeGreaterThan(0);
  });

  describe("Health endpoints", () => {
    test("/health returns 200 with correct body", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = (await response.json()) as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });

    test("/api/health returns 200 with correct body", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/health`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as HealthResponse;
      expect(body.status).toBe("ok");
    });
  });

  describe("Dashboard Stats API", () => {
    test("GET /api/dashboard/stats returns mock data", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/dashboard/stats`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        totalProducts: number;
        activeAlerts: number;
        lowStockProducts: number;
        configuredThresholds: number;
      };
      expect(body.totalProducts).toBe(156);
      expect(body.activeAlerts).toBe(3);
      expect(body.lowStockProducts).toBe(12);
      expect(body.configuredThresholds).toBe(45);
    });

    test("GET /api/dashboard/stats has CORS headers", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/dashboard/stats`);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    });
  });

  describe("Alerts API", () => {
    test("GET /api/alerts returns mock alerts", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/alerts`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { alerts: unknown[]; total: number };
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(body.total).toBeGreaterThan(0);
    });

    test("GET /api/alerts filters by type", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts?type=threshold_breach`
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { alerts: { type: string }[]; total: number };
      for (const alert of body.alerts) {
        expect(alert.type).toBe("threshold_breach");
      }
    });

    test("GET /api/alerts respects limit parameter", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts?limit=1`
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { alerts: unknown[] };
      expect(body.alerts.length).toBeLessThanOrEqual(1);
    });

    test("POST /api/alerts/:id/dismiss returns success for mock data", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts/1/dismiss`,
        { method: "POST" }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { success: boolean };
      expect(body.success).toBe(true);
    });

    test("POST /api/alerts/:id/dismiss returns 404 for unknown id", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts/unknown-id/dismiss`,
        { method: "POST" }
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Alert not found");
    });
  });

  describe("Products API", () => {
    test("GET /api/products returns paginated mock products", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/products`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: unknown[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination.total).toBeGreaterThan(0);
    });

    test("GET /api/products/:id returns product", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/products/p1`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { id: string; name: string };
      expect(body.id).toBe("p1");
    });

    test("GET /api/products/:id returns 404 for unknown product", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/products/unknown`
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Product not found");
    });
  });

  describe("Thresholds API", () => {
    test("GET /api/thresholds returns paginated mock thresholds", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/thresholds`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: unknown[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination.total).toBeGreaterThan(0);
    });

    test("POST /api/thresholds creates new threshold", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: "p5", minQuantity: 25 }),
        }
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as { productId: string; minQuantity: number };
      expect(body.productId).toBe("p5");
      expect(body.minQuantity).toBe(25);
    });

    test("POST /api/thresholds returns 400 for invalid data", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: "", minQuantity: -5 }),
        }
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; details: unknown[] };
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.details)).toBe(true);
    });

    test("PUT /api/thresholds/:id updates threshold", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/t1`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minQuantity: 50 }),
        }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { minQuantity: number };
      expect(body.minQuantity).toBe(50);
    });

    test("PUT /api/thresholds/:id returns 400 for invalid data", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/t1`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minQuantity: -10 }),
        }
      );

      expect(response.status).toBe(400);
    });

    test("PUT /api/thresholds/:id returns 404 for unknown threshold", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/unknown`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minQuantity: 50 }),
        }
      );

      expect(response.status).toBe(404);
    });

    test("DELETE /api/thresholds/:id removes threshold", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/t1`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(204);
    });

    test("DELETE /api/thresholds/:id returns 404 for unknown threshold", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/nonexistent`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Settings API", () => {
    test("GET /api/settings returns mock settings", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/settings`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        companyName: string;
        bsaleConnected: boolean;
        syncFrequency: string;
      };
      expect(body.companyName).toBeDefined();
      expect(body.bsaleConnected).toBe(true);
      expect(body.syncFrequency).toBe("daily");
    });

    test("PUT /api/settings updates settings", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName: "New Company", emailNotifications: false }),
        }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { companyName: string };
      expect(body.companyName).toBe("New Company");
    });

    test("PUT /api/settings returns 400 for invalid email", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "not-an-email" }),
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe("Auth API", () => {
    test("POST /api/auth/login returns user data on success", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com", password: "secret" }),
        }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: { email: string } };
      expect(body.user.email).toBe("test@example.com");
    });

    test("POST /api/auth/login sets session cookie", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com", password: "secret" }),
        }
      );

      const cookie = response.headers.get("Set-Cookie");
      expect(cookie).toContain("session_token=");
      expect(cookie).toContain("HttpOnly");
    });

    test("POST /api/auth/login returns 400 for invalid email", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid", password: "secret" }),
        }
      );

      expect(response.status).toBe(400);
    });

    test("POST /api/auth/logout returns success", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/auth/logout`,
        { method: "POST" }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { success: boolean };
      expect(body.success).toBe(true);
    });

    test("POST /api/auth/logout clears session cookie", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/auth/logout`,
        { method: "POST" }
      );

      const cookie = response.headers.get("Set-Cookie");
      expect(cookie).toContain("session_token=");
      expect(cookie).toContain("Max-Age=0");
    });

    test("GET /api/auth/me returns user when authenticated", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/auth/me`,
        {
          headers: { Cookie: "session_token=test-token" },
        }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: { email: string } };
      expect(body.user.email).toBe("demo@empresa.cl");
    });

    test("GET /api/auth/me returns 401 without session", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/auth/me`
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as { user: null };
      expect(body.user).toBeNull();
    });
  });

  describe("CORS Preflight", () => {
    test("OPTIONS request returns 204", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/dashboard/stats`,
        { method: "OPTIONS" }
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Methods")).toBeDefined();
    });

    test("OPTIONS request on any path returns CORS headers", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/any/path`,
        { method: "OPTIONS" }
      );

      expect(response.status).toBe(204);
    });
  });

  describe("Frontend Routes", () => {
    test("/login returns frontend HTML", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/login`);
      expect(response.status).toBe(200);
    });

    test("/app returns frontend HTML", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/app`);
      expect(response.status).toBe(200);
    });

    test("/app/alerts returns frontend HTML", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/app/alerts`);
      expect(response.status).toBe(200);
    });

    test("/app/products returns frontend HTML", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/app/products`);
      expect(response.status).toBe(200);
    });

    test("/app/thresholds returns frontend HTML", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/app/thresholds`);
      expect(response.status).toBe(200);
    });

    test("/app/settings returns frontend HTML", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/app/settings`);
      expect(response.status).toBe(200);
    });
  });

  describe("Error handling", () => {
    test("unknown routes return 404 HTML", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/unknown`);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    test("unknown API routes return 404 JSON", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/unknown`);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Not Found");
    });

    test("POST to /health returns 404", async () => {
      serverInstance = createServer(testConfig);
      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/health`,
        { method: "POST" }
      );
      expect(response.status).toBe(404);
    });
  });

  describe("Server configuration", () => {
    test("server respects configured port", () => {
      const customConfig: Config = {
        port: 0,
        nodeEnv: "test",
        syncEnabled: false,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        sentryEnvironment: "test",
      };
      serverInstance = createServer(customConfig);
      expect(serverInstance.port).toBeGreaterThan(0);
    });

    test("development mode is disabled in production", () => {
      const productionConfig: Config = {
        port: 0,
        nodeEnv: "production",
        syncEnabled: false,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        sentryEnvironment: "test",
      };
      serverInstance = createServer(productionConfig);
      expect(serverInstance.development).toBe(false);
    });

    test("development mode is enabled in non-production environments", () => {
      const devConfig: Config = {
        port: 0,
        nodeEnv: "development",
        syncEnabled: false,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        sentryEnvironment: "test",
      };
      serverInstance = createServer(devConfig);
      expect(serverInstance.development).toBe(true);
    });
  });

  describe("Production login cookie", () => {
    test("POST /api/auth/login includes Secure and SameSite in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const productionConfig: Config = {
          port: 0,
          nodeEnv: "production",
          syncEnabled: false,
          syncHour: 2,
          syncMinute: 0,
          syncBatchSize: 100,
          syncTenantDelay: 5000,
          sentryEnvironment: "test",
        };
        serverInstance = createServer(productionConfig);

        const response = await fetch(
          `http://localhost:${String(serverInstance.port)}/api/auth/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "test@example.com", password: "secret" }),
          }
        );

        const cookie = response.headers.get("Set-Cookie") ?? "";
        expect(cookie).toContain("Secure");
        expect(cookie).toContain("SameSite=Strict");
      } finally {
        process.env.NODE_ENV = originalEnv ?? "test";
      }
    });
  });
});

describe("createServer with dependencies", () => {
  let serverInstance: ReturnType<typeof createServer> | null = null;

  function createMockSession() {
    return {
      id: "session-123",
      user_id: "user-123",
      token: "test-session-token",
      expires_at: new Date(Date.now() + 86400000),
      created_at: new Date(),
    };
  }

  function createMockUser() {
    return {
      id: "user-123",
      tenant_id: "tenant-123",
      email: "test@example.com",
      name: "Test User",
      notification_enabled: true,
      notification_email: "alerts@example.com",
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  function createMockTenant() {
    return {
      id: "tenant-123",
      bsale_client_code: "12345",
      bsale_client_name: "Test Company",
      bsale_access_token: "token-abc",
      sync_status: "success" as const,
      last_sync_at: new Date(),
      stripe_customer_id: null,
      is_paid: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  function createMockDeps() {
    const mockSession = createMockSession();
    const mockUser = createMockUser();
    const mockTenant = createMockTenant();

    return {
      sessionRepo: {
        findByToken: mock(() => Promise.resolve(mockSession)),
        create: mock(() => Promise.resolve(mockSession)),
        deleteByToken: mock(() => Promise.resolve()),
        deleteExpired: mock(() => Promise.resolve(0)),
      } as unknown as ServerDependencies["sessionRepo"],
      userRepo: {
        getById: mock(() => Promise.resolve(mockUser)),
        getByEmail: mock(() => Promise.resolve(mockUser)),
        create: mock(() => Promise.resolve(mockUser)),
        update: mock(() => Promise.resolve(mockUser)),
      } as unknown as ServerDependencies["userRepo"],
      tenantRepo: {
        getById: mock(() => Promise.resolve(mockTenant)),
        findByClientCode: mock(() => Promise.resolve(mockTenant)),
        create: mock(() => Promise.resolve(mockTenant)),
        update: mock(() => Promise.resolve(mockTenant)),
      } as unknown as ServerDependencies["tenantRepo"],
      alertRepo: {
        findByUserWithFilter: mock(() =>
          Promise.resolve({
            alerts: [
              {
                id: "alert-1",
                user_id: "user-123",
                bsale_variant_id: 1001,
                sku: "SKU001",
                product_name: "Test Product",
                alert_type: "low_stock" as const,
                current_quantity: 5,
                threshold_quantity: 10,
                status: "pending" as const,
                sent_at: null,
                created_at: new Date(),
              },
            ],
            total: 1,
          })
        ),
        countPendingByUser: mock(() => Promise.resolve(3)),
        getById: mock(() =>
          Promise.resolve({
            id: "alert-1",
            user_id: "user-123",
            bsale_variant_id: 1001,
            sku: "SKU001",
            product_name: "Test Product",
            alert_type: "low_stock" as const,
            current_quantity: 5,
            threshold_quantity: 10,
            status: "pending" as const,
            sent_at: null,
            created_at: new Date(),
          })
        ),
        markAsDismissed: mock(() => Promise.resolve()),
      } as unknown as ServerDependencies["alertRepo"],
      thresholdRepo: {
        getByUser: mock(() =>
          Promise.resolve([
            {
              id: "threshold-1",
              tenant_id: "tenant-123",
              user_id: "user-123",
              bsale_variant_id: 1001,
              min_quantity: 10,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ])
        ),
        getByUserPaginated: mock(() =>
          Promise.resolve({
            data: [
              {
                id: "threshold-1",
                tenant_id: "tenant-123",
                user_id: "user-123",
                bsale_variant_id: 1001,
                min_quantity: 10,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
            pagination: {
              page: 1,
              limit: 20,
              total: 1,
              totalPages: 1,
            },
          })
        ),
        countByUser: mock(() => Promise.resolve(5)),
        getById: mock(() =>
          Promise.resolve({
            id: "threshold-1",
            tenant_id: "tenant-123",
            user_id: "user-123",
            bsale_variant_id: 1001,
            min_quantity: 10,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ),
        create: mock(() =>
          Promise.resolve({
            id: "threshold-new",
            tenant_id: "tenant-123",
            user_id: "user-123",
            bsale_variant_id: 2001,
            min_quantity: 20,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ),
        update: mock(() =>
          Promise.resolve({
            id: "threshold-1",
            tenant_id: "tenant-123",
            user_id: "user-123",
            bsale_variant_id: 1001,
            min_quantity: 50,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ),
        delete: mock(() => Promise.resolve(true)),
      } as unknown as ServerDependencies["thresholdRepo"],
      stockSnapshotRepo: {
        countDistinctProductsByTenant: mock(() => Promise.resolve(100)),
        countLowStockByTenant: mock(() => Promise.resolve(15)),
        getById: mock(() => Promise.resolve(null)), // Returns null to fall back to mock data
        getLatestByTenant: mock(() =>
          Promise.resolve([
            {
              id: "snapshot-1",
              tenant_id: "tenant-123",
              bsale_variant_id: 1001,
              bsale_office_id: null,
              sku: "SKU001",
              barcode: "123456",
              product_name: "Test Product",
              quantity: 50,
              quantity_reserved: 5,
              quantity_available: 45,
              snapshot_date: new Date(),
              created_at: new Date(),
            },
          ])
        ),
        getLatestByTenantPaginated: mock(() =>
          Promise.resolve({
            data: [
              {
                id: "snapshot-1",
                tenant_id: "tenant-123",
                bsale_variant_id: 1001,
                bsale_office_id: null,
                sku: "SKU001",
                barcode: "123456",
                product_name: "Test Product",
                quantity: 50,
                quantity_reserved: 5,
                quantity_available: 45,
                snapshot_date: new Date(),
                created_at: new Date(),
              },
            ],
            pagination: {
              page: 1,
              limit: 20,
              total: 1,
              totalPages: 1,
            },
          })
        ),
      } as unknown as ServerDependencies["stockSnapshotRepo"],
    } as ServerDependencies;
  }

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop(true);
      serverInstance = null;
    }
  });

  describe("Authenticated Dashboard Stats", () => {
    test("returns real data when authenticated with repos", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/dashboard/stats`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { totalProducts: number; activeAlerts: number };
      expect(body.totalProducts).toBe(100);
      expect(body.activeAlerts).toBe(3);
    });
  });

  describe("Authenticated Alerts API", () => {
    test("GET /api/alerts returns DB alerts when authenticated", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { alerts: { type: string }[]; total: number };
      expect(body.alerts.length).toBe(1);
      expect(body.alerts[0]?.type).toBe("threshold_breach");
    });

    test("GET /api/alerts filters by type with DB", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts?type=out_of_stock`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
    });

    test("GET /api/alerts filters by low_velocity type", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts?type=low_velocity`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
    });

    test("POST /api/alerts/:id/dismiss dismisses alert in DB", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts/alert-1/dismiss`,
        {
          method: "POST",
          headers: { Cookie: "session_token=test-session-token" },
        }
      );

      expect(response.status).toBe(200);
    });

    test("POST /api/alerts/:id/dismiss returns 404 for nonexistent alert", async () => {
      const deps = createMockDeps();
      (deps.alertRepo?.getById as Mock<() => Promise<null>>).mockResolvedValue(null);
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts/unknown/dismiss`,
        {
          method: "POST",
          headers: { Cookie: "session_token=test-session-token" },
        }
      );

      expect(response.status).toBe(404);
    });

    test("POST /api/alerts/:id/dismiss returns 404 for other user's alert", async () => {
      const deps = createMockDeps();
      (deps.alertRepo?.getById as Mock<() => Promise<unknown>>).mockResolvedValue({
        id: "alert-other",
        user_id: "other-user",
        bsale_variant_id: 1001,
        sku: "SKU001",
        product_name: "Test",
        alert_type: "low_stock",
        current_quantity: 5,
        threshold_quantity: 10,
        status: "pending",
        sent_at: null,
        created_at: new Date(),
      });
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/alerts/alert-other/dismiss`,
        {
          method: "POST",
          headers: { Cookie: "session_token=test-session-token" },
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Authenticated Products API", () => {
    test("GET /api/products returns paginated DB products when authenticated", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/products`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { sku: string }[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body.data[0]?.sku).toBe("SKU001");
      expect(body.pagination.page).toBe(1);
    });

    test("GET /api/products/:id falls back to mock for authenticated requests", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/products/p1`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
    });
  });

  describe("Authenticated Thresholds API", () => {
    test("GET /api/thresholds returns paginated DB thresholds when authenticated", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { minQuantity: number }[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body.data[0]?.minQuantity).toBe(10);
      expect(body.pagination.page).toBe(1);
    });

    test("POST /api/thresholds creates threshold in DB", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: "session_token=test-session-token",
          },
          body: JSON.stringify({ productId: "2001", minQuantity: 20 }),
        }
      );

      expect(response.status).toBe(201);
    });

    test("PUT /api/thresholds/:id updates threshold in DB", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/threshold-1`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: "session_token=test-session-token",
          },
          body: JSON.stringify({ minQuantity: 50 }),
        }
      );

      expect(response.status).toBe(200);
    });

    test("PUT /api/thresholds/:id returns 404 for nonexistent", async () => {
      const deps = createMockDeps();
      (deps.thresholdRepo?.getById as Mock<() => Promise<null>>).mockResolvedValue(null);
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/unknown`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: "session_token=test-session-token",
          },
          body: JSON.stringify({ minQuantity: 50 }),
        }
      );

      expect(response.status).toBe(404);
    });

    test("PUT /api/thresholds/:id returns 404 for other user's threshold", async () => {
      const deps = createMockDeps();
      (deps.thresholdRepo?.getById as Mock<() => Promise<unknown>>).mockResolvedValue({
        id: "threshold-other",
        tenant_id: "tenant-123",
        user_id: "other-user",
        bsale_variant_id: 1001,
        min_quantity: 10,
        created_at: new Date(),
        updated_at: new Date(),
      });
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/threshold-other`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: "session_token=test-session-token",
          },
          body: JSON.stringify({ minQuantity: 50 }),
        }
      );

      expect(response.status).toBe(404);
    });

    test("DELETE /api/thresholds/:id deletes from DB", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/threshold-1`,
        {
          method: "DELETE",
          headers: { Cookie: "session_token=test-session-token" },
        }
      );

      expect(response.status).toBe(204);
    });

    test("DELETE /api/thresholds/:id returns 404 for nonexistent", async () => {
      const deps = createMockDeps();
      (deps.thresholdRepo?.getById as Mock<() => Promise<null>>).mockResolvedValue(null);
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/unknown`,
        {
          method: "DELETE",
          headers: { Cookie: "session_token=test-session-token" },
        }
      );

      expect(response.status).toBe(404);
    });

    test("DELETE /api/thresholds/:id returns 404 for other user's threshold", async () => {
      const deps = createMockDeps();
      (deps.thresholdRepo?.getById as Mock<() => Promise<unknown>>).mockResolvedValue({
        id: "threshold-other",
        tenant_id: "tenant-123",
        user_id: "other-user",
        bsale_variant_id: 1001,
        min_quantity: 10,
        created_at: new Date(),
        updated_at: new Date(),
      });
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/threshold-other`,
        {
          method: "DELETE",
          headers: { Cookie: "session_token=test-session-token" },
        }
      );

      expect(response.status).toBe(404);
    });

    test("DELETE /api/thresholds/:id returns 404 when delete fails", async () => {
      const deps = createMockDeps();
      (deps.thresholdRepo?.delete as Mock<() => Promise<boolean>>).mockResolvedValue(false);
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/thresholds/threshold-1`,
        {
          method: "DELETE",
          headers: { Cookie: "session_token=test-session-token" },
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Authenticated Settings API", () => {
    test("GET /api/settings returns DB settings when authenticated", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/settings`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { companyName: string; email: string };
      expect(body.companyName).toBe("Test Company");
      expect(body.email).toBe("test@example.com");
    });

    test("GET /api/settings falls back to mock when user not found", async () => {
      const deps = createMockDeps();
      (deps.userRepo?.getById as Mock<() => Promise<null>>).mockResolvedValue(null);
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/settings`,
        { headers: { Cookie: "session_token=test-session-token" } }
      );

      expect(response.status).toBe(200);
    });

    test("PUT /api/settings updates user settings in DB", async () => {
      const deps = createMockDeps();
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/settings`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: "session_token=test-session-token",
          },
          body: JSON.stringify({ emailNotifications: false, notificationEmail: "new@example.com" }),
        }
      );

      expect(response.status).toBe(200);
    });
  });

  // OAuth and Billing routes are thoroughly tested in their own test files
  // (oauth.test.ts and billing.test.ts). The fetch handler paths that route
  // to these handlers are covered by those tests.

  describe("Authentication middleware error handling", () => {
    test("tryAuthenticate returns null when session not found", async () => {
      const deps = createMockDeps();
      (deps.sessionRepo?.findByToken as Mock<() => Promise<null>>).mockResolvedValue(null);
      serverInstance = createServer(testConfig, deps);

      const response = await fetch(
        `http://localhost:${String(serverInstance.port)}/api/dashboard/stats`,
        { headers: { Cookie: "session_token=invalid-token" } }
      );

      // Falls back to mock data
      expect(response.status).toBe(200);
    });
  });
});

describe("startServer", () => {
  let serverInstance: ReturnType<typeof startServer> | null = null;

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop(true);
      serverInstance = null;
    }
  });

  test("starts server with provided config", () => {
    serverInstance = startServer(testConfig);
    expect(serverInstance.port).toBeGreaterThan(0);
  });

  test("starts server with dependencies", () => {
    serverInstance = startServer(testConfig, {});
    expect(serverInstance.port).toBeGreaterThan(0);
  });
});

describe("withErrorBoundary", () => {
  test("returns successful response from handler", async () => {
    const handler = () => new Response("OK", { status: 200 });
    const wrapped = withErrorBoundary(handler);

    const request = new Request("http://localhost/test");
    const response = await wrapped(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });

  test("returns async response from handler", async () => {
    const handler = () => Promise.resolve(new Response("Async OK", { status: 200 }));
    const wrapped = withErrorBoundary(handler);

    const request = new Request("http://localhost/test");
    const response = await wrapped(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Async OK");
  });

  test("catches sync errors and returns 500", async () => {
    const handler = () => {
      throw new Error("Test error");
    };
    const wrapped = withErrorBoundary(handler);

    const request = new Request("http://localhost/test");
    const response = await wrapped(request);

    expect(response.status).toBe(500);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("Internal server error");
  });

  test("catches async errors and returns 500", async () => {
    const handler = () => Promise.reject(new Error("Async error"));
    const wrapped = withErrorBoundary(handler);

    const request = new Request("http://localhost/test");
    const response = await wrapped(request);

    expect(response.status).toBe(500);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("Internal server error");
  });

  test("includes CORS headers in error response", async () => {
    const handler = () => {
      throw new Error("Test error");
    };
    const wrapped = withErrorBoundary(handler);

    const request = new Request("http://localhost/test");
    const response = await wrapped(request);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeDefined();
  });
});
