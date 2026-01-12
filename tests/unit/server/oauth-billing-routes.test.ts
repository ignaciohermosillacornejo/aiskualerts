/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function, @typescript-eslint/restrict-template-expressions */
import { test, expect, describe, beforeAll, afterAll, mock } from "bun:test";
import { createServer } from "../../../src/server";
import { loadConfig } from "../../../src/config";
import type { Server } from "bun";
import type { OAuthHandlerDeps } from "../../../src/api/handlers/oauth";
import type { BillingHandlerDeps } from "../../../src/api/handlers/billing";

describe("Server OAuth Routes", () => {
  let server: Server<unknown>;
  let baseUrl: string;

  const mockOAuthDeps: OAuthHandlerDeps = {
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
    } as any,
    tenantRepo: {
      findByClientCode: mock(() => Promise.resolve(null)),
      create: mock(() =>
        Promise.resolve({
          id: "tenant-123",
          bsale_client_code: "client-123",
        })
      ),
      update: mock(() => Promise.resolve({})),
    } as any,
    userRepo: {
      getByEmail: mock(() => Promise.resolve(null)),
      create: mock(() =>
        Promise.resolve({
          id: "user-123",
          email: "admin@client-123",
        })
      ),
    } as any,
    sessionRepo: {
      create: mock(() => Promise.resolve({ id: "session-123" })),
      deleteByToken: mock(() => Promise.resolve()),
    } as any,
    stateStore: {
      set: mock(() => {}),
      consume: mock(() => ({
        codeVerifier: "verifier-123",
        clientCode: "client-123",
      })),
    } as any,
  };

  beforeAll(async () => {
    const config = loadConfig();
    config.port = 0;
    server = createServer(config, { oauthDeps: mockOAuthDeps });
    baseUrl = `http://localhost:${server.port}`;

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

  const mockBillingDeps: BillingHandlerDeps = {
    stripeClient: {
      createCheckoutSession: mock(() =>
        Promise.resolve("https://checkout.stripe.com/session-123")
      ),
      createPortalSession: mock(() =>
        Promise.resolve("https://billing.stripe.com/portal-123")
      ),
      parseWebhookEvent: mock(() => ({
        type: "checkout.session.completed",
        data: {
          object: {
            customer: "cus_123",
            metadata: { tenantId: "tenant-123" },
          },
        },
      })),
      processWebhookEvent: mock(() => ({
        type: "checkout_completed",
        tenantId: "tenant-123",
        customerId: "cus_123",
      })),
    } as any,
    tenantRepo: {
      getById: mock(() =>
        Promise.resolve({
          id: "tenant-123",
          stripe_customer_id: "cus_123",
          is_paid: false, // Not paid yet for checkout
        })
      ),
      updateStripeCustomer: mock(() => Promise.resolve()),
      findByStripeCustomerId: mock(() =>
        Promise.resolve({
          id: "tenant-123",
          stripe_customer_id: "cus_123",
        })
      ),
      updatePaidStatus: mock(() => Promise.resolve()),
    } as any,
    userRepo: {
      getById: mock(() =>
        Promise.resolve({
          id: "user-123",
          email: "test@test.com",
          tenant_id: "tenant-123",
        })
      ),
    } as any,
    authMiddleware: {
      authenticate: mock(() =>
        Promise.resolve({
          userId: "user-123",
          tenantId: "tenant-123",
        })
      ),
    } as any,
  };

  beforeAll(async () => {
    const config = loadConfig();
    config.port = 0;
    server = createServer(config, { billingDeps: mockBillingDeps });
    baseUrl = `http://localhost:${server.port}`;

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
      const body = await response.json() as { url: string };
      expect(body.url).toContain("stripe.com");
    });
  });

  describe("POST /api/billing/portal", () => {
    test("returns portal URL", async () => {
      const response = await fetch(`${baseUrl}/api/billing/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session_token=valid-token",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { url: string };
      expect(body.url).toContain("stripe.com");
    });
  });

  describe("POST /api/webhooks/stripe", () => {
    test("processes webhook event", async () => {
      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "test-signature",
        },
        body: JSON.stringify({
          type: "checkout.session.completed",
          data: { object: { customer: "cus_123" } },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { received: boolean };
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
