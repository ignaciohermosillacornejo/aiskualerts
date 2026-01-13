import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createServer, createHealthResponse, type HealthResponse } from "../../../src/server";
import { loadConfig } from "../../../src/config";
import type { Server } from "bun";
import type { OAuthHandlerDeps } from "../../../src/api/handlers/oauth";
import type { BillingHandlerDeps } from "../../../src/api/handlers/billing";

describe("Server Routes - Extended Coverage", () => {
  let server: Server<unknown>;
  let baseUrl: string;

  beforeAll(async () => {
    const config = loadConfig();
    config.port = 0; // Random available port
    server = createServer(config);
    baseUrl = `http://localhost:${String(server.port)}`;

    // Wait for server to be ready
    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });

  afterAll(async () => {
    await server.stop();
  });

  describe("createHealthResponse", () => {
    test("returns ok status", () => {
      const response = createHealthResponse();
      expect(response.status).toBe("ok");
    });

    test("returns ISO timestamp", () => {
      const response = createHealthResponse();
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("timestamp is valid date", () => {
      const response = createHealthResponse();
      const date = new Date(response.timestamp);
      expect(date.getTime()).not.toBeNaN();
    });
  });

  describe("GET /health", () => {
    test("returns 200 OK", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
    });

    test("returns JSON content type", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get("Content-Type")).toContain("application/json");
    });

    test("returns health response body", async () => {
      const response = await fetch(`${baseUrl}/health`);
      const body = (await response.json()) as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("GET /api/health", () => {
    test("returns 200 OK", async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
    });
  });

  describe("GET /api/dashboard/stats", () => {
    test("returns dashboard statistics", async () => {
      const response = await fetch(`${baseUrl}/api/dashboard/stats`);
      const body = (await response.json()) as {
        totalProducts: number;
        activeAlerts: number;
        lowStockProducts: number;
        configuredThresholds: number;
      };

      expect(response.status).toBe(200);
      expect(body.totalProducts).toBeDefined();
      expect(body.activeAlerts).toBeDefined();
      expect(body.lowStockProducts).toBeDefined();
      expect(body.configuredThresholds).toBeDefined();
    });
  });

  describe("GET /api/alerts", () => {
    test("returns alerts array", async () => {
      const response = await fetch(`${baseUrl}/api/alerts`);
      const body = (await response.json()) as { alerts: unknown[]; total: number };

      expect(response.status).toBe(200);
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(typeof body.total).toBe("number");
    });

    test("filters by type", async () => {
      const response = await fetch(`${baseUrl}/api/alerts?type=threshold_breach`);
      const body = (await response.json()) as { alerts: { type: string }[] };

      expect(response.status).toBe(200);
      body.alerts.forEach((alert) => {
        expect(alert.type).toBe("threshold_breach");
      });
    });

    test("respects limit parameter", async () => {
      const response = await fetch(`${baseUrl}/api/alerts?limit=1`);
      const body = (await response.json()) as { alerts: unknown[] };

      expect(response.status).toBe(200);
      expect(body.alerts.length).toBeLessThanOrEqual(1);
    });
  });

  describe("POST /api/alerts/:id/dismiss", () => {
    test("returns success for existing alert", async () => {
      const response = await fetch(`${baseUrl}/api/alerts/1/dismiss`, {
        method: "POST",
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { success: boolean };
      expect(body.success).toBe(true);
    });

    test("returns 404 for non-existent alert", async () => {
      const response = await fetch(`${baseUrl}/api/alerts/nonexistent/dismiss`, {
        method: "POST",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/products", () => {
    test("returns products array", async () => {
      const response = await fetch(`${baseUrl}/api/products`);
      const body = (await response.json()) as { products: unknown[]; total: number };

      expect(response.status).toBe(200);
      expect(Array.isArray(body.products)).toBe(true);
      expect(typeof body.total).toBe("number");
    });
  });

  describe("GET /api/products/:id", () => {
    test("returns product for valid ID", async () => {
      const response = await fetch(`${baseUrl}/api/products/p1`);
      const body = (await response.json()) as { id: string };

      expect(response.status).toBe(200);
      expect(body.id).toBe("p1");
    });

    test("returns 404 for invalid ID", async () => {
      const response = await fetch(`${baseUrl}/api/products/invalid`);
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/thresholds", () => {
    test("returns thresholds array", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds`);
      const body = (await response.json()) as { thresholds: unknown[]; total: number };

      expect(response.status).toBe(200);
      expect(Array.isArray(body.thresholds)).toBe(true);
    });
  });

  describe("POST /api/thresholds", () => {
    test("creates new threshold", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "p1", minQuantity: 15 }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { productId: string; minQuantity: number };
      expect(body.productId).toBe("p1");
      expect(body.minQuantity).toBe(15);
    });

    test("returns 400 for missing productId", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minQuantity: 15 }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; details: { path: string }[] };
      expect(body.error).toBe("Validation failed");
      expect(body.details.some((d) => d.path === "productId")).toBe(true);
    });

    test("returns 400 for missing minQuantity", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "p1" }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; details: { path: string }[] };
      expect(body.error).toBe("Validation failed");
      expect(body.details.some((d) => d.path === "minQuantity")).toBe(true);
    });

    test("returns 400 for invalid minQuantity type", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "p1", minQuantity: "not-a-number" }),
      });

      expect(response.status).toBe(400);
    });

    test("returns 400 for negative minQuantity", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "p1", minQuantity: -5 }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("PUT /api/thresholds/:id", () => {
    test("updates existing threshold", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds/t1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minQuantity: 25 }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { minQuantity: number };
      expect(body.minQuantity).toBe(25);
    });

    test("returns 404 for non-existent threshold", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds/nonexistent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minQuantity: 10 }),
      });

      expect(response.status).toBe(404);
    });

    test("returns 400 for missing minQuantity", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds/t2`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; details: { path: string }[] };
      expect(body.error).toBe("Validation failed");
    });

    test("returns 400 for invalid minQuantity type", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds/t2`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minQuantity: "invalid" }),
      });

      expect(response.status).toBe(400);
    });

    test("returns 400 for negative minQuantity", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds/t2`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minQuantity: -10 }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/thresholds/:id", () => {
    test("deletes existing threshold", async () => {
      // First create one to delete
      await fetch(`${baseUrl}/api/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "p5", minQuantity: 5 }),
      });

      const response = await fetch(`${baseUrl}/api/thresholds/t1`, {
        method: "DELETE",
      });

      expect(response.status).toBe(204);
    });

    test("returns 404 for non-existent threshold", async () => {
      const response = await fetch(`${baseUrl}/api/thresholds/nonexistent-id`, {
        method: "DELETE",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/settings", () => {
    test("returns settings object", async () => {
      const response = await fetch(`${baseUrl}/api/settings`);
      const body = (await response.json()) as { companyName: string };

      expect(response.status).toBe(200);
      expect(body.companyName).toBeDefined();
    });
  });

  describe("PUT /api/settings", () => {
    test("updates settings", async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: false }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { emailNotifications: boolean };
      expect(body.emailNotifications).toBe(false);
    });

    test("returns 400 for invalid email format", async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; details: { path: string }[] };
      expect(body.error).toBe("Validation failed");
      expect(body.details.some((d) => d.path === "email")).toBe(true);
    });

    test("returns 400 for invalid notificationEmail format", async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationEmail: "invalid-email" }),
      });

      expect(response.status).toBe(400);
    });

    test("returns 400 for invalid syncFrequency", async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncFrequency: "monthly" }),
      });

      expect(response.status).toBe(400);
    });

    test("accepts valid syncFrequency values", async () => {
      for (const freq of ["hourly", "daily", "weekly"]) {
        const response = await fetch(`${baseUrl}/api/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syncFrequency: freq }),
        });

        expect(response.status).toBe(200);
      }
    });
  });

  describe("POST /api/auth/login", () => {
    test("returns user and sets cookie on valid credentials", async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@test.com", password: "password" }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: { email: string } };
      expect(body.user.email).toBe("test@test.com");
      expect(response.headers.get("Set-Cookie")).toContain("session_token=");
    });

    test("returns 400 for missing credentials", async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; details: unknown[] };
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
    });

    test("returns 400 for missing password", async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@test.com" }),
      });

      expect(response.status).toBe(400);
    });

    test("returns 400 for invalid email format", async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "password" }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; details: { path: string; message: string }[] };
      expect(body.error).toBe("Validation failed");
      expect(body.details.some((d) => d.path === "email")).toBe(true);
    });
  });

  describe("POST /api/auth/logout", () => {
    test("clears session cookie", async () => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });
  });

  describe("GET /api/auth/me", () => {
    test("returns user when authenticated", async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: { id: string } };
      expect(body.user.id).toBeDefined();
    });

    test("returns 401 when not authenticated", async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`);

      expect(response.status).toBe(401);
    });
  });

  describe("SPA Routes", () => {
    test("serves index for /", async () => {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/html");
    });

    test("serves index for /login", async () => {
      const response = await fetch(`${baseUrl}/login`);
      expect(response.status).toBe(200);
    });

    test("serves index for /app", async () => {
      const response = await fetch(`${baseUrl}/app`);
      expect(response.status).toBe(200);
    });

    test("serves index for /app/alerts", async () => {
      const response = await fetch(`${baseUrl}/app/alerts`);
      expect(response.status).toBe(200);
    });

    test("serves index for /app/products", async () => {
      const response = await fetch(`${baseUrl}/app/products`);
      expect(response.status).toBe(200);
    });

    test("serves index for /app/thresholds", async () => {
      const response = await fetch(`${baseUrl}/app/thresholds`);
      expect(response.status).toBe(200);
    });

    test("serves index for /app/settings", async () => {
      const response = await fetch(`${baseUrl}/app/settings`);
      expect(response.status).toBe(200);
    });
  });

  describe("Fallback handler", () => {
    test("returns 404 for unknown API routes", async () => {
      const response = await fetch(`${baseUrl}/api/unknown-endpoint`);
      expect(response.status).toBe(404);
    });

    test("returns 404 HTML for unknown routes", async () => {
      const response = await fetch(`${baseUrl}/unknown-page`);
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toContain("text/html");
    });
  });
});

describe("Server with OAuth routes", () => {
  test("createServer accepts OAuth dependencies", async () => {
    const config = loadConfig();
    config.port = 0;

    // Create minimal mock that satisfies the type using indexed access types
    const mockOAuthDeps: OAuthHandlerDeps = {
      oauthClient: {} as unknown as OAuthHandlerDeps["oauthClient"],
      tenantRepo: {} as unknown as OAuthHandlerDeps["tenantRepo"],
      userRepo: {} as unknown as OAuthHandlerDeps["userRepo"],
      sessionRepo: {} as unknown as OAuthHandlerDeps["sessionRepo"],
      stateStore: {} as unknown as OAuthHandlerDeps["stateStore"],
    };

    const server = createServer(config, { oauthDeps: mockOAuthDeps });
    expect(server).toBeDefined();
    await server.stop();
  });

  test("createServer accepts billing dependencies", async () => {
    const config = loadConfig();
    config.port = 0;

    // Create minimal mock that satisfies the type using indexed access types
    const mockBillingDeps: BillingHandlerDeps = {
      stripeClient: {} as unknown as BillingHandlerDeps["stripeClient"],
      tenantRepo: {} as unknown as BillingHandlerDeps["tenantRepo"],
      userRepo: {} as unknown as BillingHandlerDeps["userRepo"],
      authMiddleware: {} as unknown as BillingHandlerDeps["authMiddleware"],
    };

    const server = createServer(config, { billingDeps: mockBillingDeps });
    expect(server).toBeDefined();
    await server.stop();
  });
});

describe("Server with repository dependencies", () => {
  test("createServer accepts repository dependencies", async () => {
    const config = loadConfig();
    config.port = 0;

    // Create minimal mocks that satisfy the types
    const mockAlertRepo = {} as unknown as import("../../../src/server").ServerDependencies["alertRepo"];
    const mockThresholdRepo = {} as unknown as import("../../../src/server").ServerDependencies["thresholdRepo"];
    const mockUserRepo = {} as unknown as import("../../../src/server").ServerDependencies["userRepo"];
    const mockTenantRepo = {} as unknown as import("../../../src/server").ServerDependencies["tenantRepo"];
    const mockStockSnapshotRepo = {} as unknown as import("../../../src/server").ServerDependencies["stockSnapshotRepo"];
    const mockSessionRepo = {} as unknown as import("../../../src/server").ServerDependencies["sessionRepo"];

    const server = createServer(config, {
      alertRepo: mockAlertRepo,
      thresholdRepo: mockThresholdRepo,
      userRepo: mockUserRepo,
      tenantRepo: mockTenantRepo,
      stockSnapshotRepo: mockStockSnapshotRepo,
      sessionRepo: mockSessionRepo,
    });
    expect(server).toBeDefined();
    await server.stop();
  });

  test("routes fall back to mock data when repos are provided but user is not authenticated", async () => {
    const config = loadConfig();
    config.port = 0;

    // Create minimal mocks - routes should use mock data when not authenticated
    const mockSessionRepo = {
      findByToken: async () => null, // User not authenticated
    } as unknown as import("../../../src/server").ServerDependencies["sessionRepo"];
    const mockUserRepo = {} as unknown as import("../../../src/server").ServerDependencies["userRepo"];

    const server = createServer(config, {
      sessionRepo: mockSessionRepo,
      userRepo: mockUserRepo,
    });
    const baseUrl = `http://localhost:${String(server.port)}`;

    // Dashboard stats should return mock data when not authenticated
    const response = await fetch(`${baseUrl}/api/dashboard/stats`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { totalProducts: number };
    expect(body.totalProducts).toBe(156); // Mock data value

    await server.stop();
  });
});
