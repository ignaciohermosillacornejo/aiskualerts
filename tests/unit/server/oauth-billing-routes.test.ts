import { test, expect, describe, beforeAll, afterAll, mock } from "bun:test";
import { createServer } from "../../../src/server";
import { loadConfig } from "../../../src/config";
import type { Server } from "bun";
import type { OAuthHandlerDeps } from "../../../src/api/handlers/oauth";
import type { BillingHandlerDeps } from "../../../src/api/handlers/billing";

// Create properly typed mock factories using indexed access types
// This pattern casts partial mocks to the expected interface type
function createMockOAuthDeps(): OAuthHandlerDeps {
  return {
    oauthClient: {
      getAuthorizationUrl: mock(() => "https://bsale.com/oauth?client_id=test"),
      exchangeCodeForToken: mock(() =>
        Promise.resolve({
          data: {
            accessToken: "token-123",
            clientCode: "client-123",
            clientName: "Test Client",
          },
        })
      ),
    } as unknown as OAuthHandlerDeps["oauthClient"],
    tenantRepo: {
      findByClientCode: mock(() => Promise.resolve(null)),
      create: mock(() =>
        Promise.resolve({
          id: "tenant-123",
          bsale_client_code: "client-123",
        })
      ),
      update: mock(() => Promise.resolve({})),
    } as unknown as OAuthHandlerDeps["tenantRepo"],
    userRepo: {
      getByEmail: mock(() => Promise.resolve(null)),
      create: mock(() =>
        Promise.resolve({
          id: "user-123",
          email: "admin@client-123",
        })
      ),
    } as unknown as OAuthHandlerDeps["userRepo"],
    sessionRepo: {
      create: mock(() => Promise.resolve({ id: "session-123" })),
      deleteByToken: mock(() => Promise.resolve()),
    } as unknown as OAuthHandlerDeps["sessionRepo"],
    stateStore: {
      set: mock(() => undefined),
      consume: mock(() => ({
        codeVerifier: "verifier-123",
        clientCode: "client-123",
      })),
    } as unknown as OAuthHandlerDeps["stateStore"],
  };
}

function createMockBillingDeps(): BillingHandlerDeps {
  return {
    mercadoPagoClient: {
      createSubscription: mock(() =>
        Promise.resolve("https://www.mercadopago.cl/subscriptions/checkout/123")
      ),
      cancelSubscription: mock(() =>
        Promise.resolve(new Date("2025-02-01"))
      ),
      validateWebhookSignature: mock(() => true),
      processWebhookEvent: mock(() =>
        Promise.resolve({
          type: "subscription_authorized" as const,
          subscriptionId: "sub_123",
          tenantId: "tenant-123",
        })
      ),
    } as unknown as BillingHandlerDeps["mercadoPagoClient"],
    tenantRepo: {
      getById: mock(() =>
        Promise.resolve({
          id: "tenant-123",
          subscription_id: "sub_123",
          subscription_status: "none",
          subscription_ends_at: null,
        })
      ),
      activateSubscription: mock(() => Promise.resolve()),
      findBySubscriptionId: mock(() =>
        Promise.resolve({
          id: "tenant-123",
          subscription_id: "sub_123",
        })
      ),
      updateSubscriptionStatus: mock(() => Promise.resolve()),
    } as unknown as BillingHandlerDeps["tenantRepo"],
    userRepo: {
      getById: mock(() =>
        Promise.resolve({
          id: "user-123",
          email: "test@test.com",
          tenant_id: "tenant-123",
        })
      ),
    } as unknown as BillingHandlerDeps["userRepo"],
    authMiddleware: {
      authenticate: mock(() =>
        Promise.resolve({
          userId: "user-123",
          tenantId: "tenant-123",
        })
      ),
    } as unknown as BillingHandlerDeps["authMiddleware"],
  };
}

describe("Server OAuth Routes", () => {
  let server: Server<unknown>;
  let baseUrl: string;
  const mockOAuthDeps = createMockOAuthDeps();

  beforeAll(async () => {
    const config = loadConfig();
    config.port = 0;
    server = createServer(config, { oauthDeps: mockOAuthDeps });
    baseUrl = `http://localhost:${String(server.port)}`;

    // Wait for server
    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  afterAll(async () => {
    await server.stop();
  });

  describe("GET /api/auth/bsale/start", () => {
    test("redirects to OAuth authorization URL", async () => {
      const response = await fetch(
        `${baseUrl}/api/auth/bsale/start?client_code=test-client`,
        { redirect: "manual" }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("bsale.com/oauth");
    });
  });

  describe("GET /api/auth/bsale/callback", () => {
    test("handles OAuth callback and sets cookie", async () => {
      const response = await fetch(
        `${baseUrl}/api/auth/bsale/callback?code=auth-code&state=valid-state`,
        { redirect: "manual" }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/app");
      expect(response.headers.get("Set-Cookie")).toContain("session_token=");
    });
  });

  describe("POST /api/auth/logout (OAuth)", () => {
    test("clears session cookie", async () => {
      // Note: The standard routes object handles /api/auth/logout first
      // It returns 200 with JSON, not 302 redirect
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: "session_token=test-token",
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Set-Cookie")).toContain("session_token=");
      expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });
  });
});

describe("Server Billing Routes", () => {
  let server: Server<unknown>;
  let baseUrl: string;
  const mockBillingDeps = createMockBillingDeps();

  beforeAll(async () => {
    const config = loadConfig();
    config.port = 0;
    server = createServer(config, { billingDeps: mockBillingDeps });
    baseUrl = `http://localhost:${String(server.port)}`;

    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  afterAll(async () => {
    await server.stop();
  });

  describe("POST /api/billing/checkout", () => {
    test("returns checkout URL", async () => {
      const response = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session_token=valid-token",
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { url: string };
      expect(body.url).toContain("mercadopago");
    });
  });

  describe("POST /api/billing/cancel", () => {
    test("cancels subscription and returns end date", async () => {
      const response = await fetch(`${baseUrl}/api/billing/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session_token=valid-token",
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { message: string; endsAt: string };
      expect(body.message).toBe("Subscription cancelled");
    });
  });

  describe("POST /api/webhooks/mercadopago", () => {
    test("processes webhook event", async () => {
      const response = await fetch(`${baseUrl}/api/webhooks/mercadopago`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": "ts=123,v1=valid-hash",
          "x-request-id": "req-123",
        },
        body: JSON.stringify({
          type: "subscription_preapproval",
          data: { id: "sub_123" },
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);
    });
  });
});

describe("Server startServer function", () => {
  test("exports startServer function", async () => {
    const { startServer } = await import("../../../src/server");
    expect(typeof startServer).toBe("function");
  });
});
