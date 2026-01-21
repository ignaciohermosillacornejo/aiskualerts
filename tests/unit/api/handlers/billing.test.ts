import { test, expect, describe, mock, type Mock } from "bun:test";
import {
  createBillingRoutes,
  type BillingHandlerDeps,
} from "@/api/handlers/billing";
import type { MercadoPagoClient, WebhookResult } from "@/billing/mercadopago";
import type { UserRepository } from "@/db/repositories/user";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import type { User } from "@/db/repositories/types";
import { AuthenticationError } from "@/api/middleware/auth";

const mockUser: User = {
  id: "user-123",
  tenant_id: "123e4567-e89b-12d3-a456-426614174000",
  email: "test@example.com",
  name: "Test User",
  last_tenant_id: "123e4567-e89b-12d3-a456-426614174000",
  notification_enabled: true,
  notification_email: null,
  digest_frequency: "daily",
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
};

const mockPaidUser: User = {
  ...mockUser,
  subscription_id: "sub_123",
  subscription_status: "active",
};

interface MockMercadoPagoClient {
  createSubscription: Mock<() => Promise<string>>;
  cancelSubscription: Mock<() => Promise<Date>>;
  validateWebhookSignature: Mock<() => boolean>;
  processWebhookEvent: Mock<() => Promise<WebhookResult>>;
}

interface MockUserRepo {
  getById: Mock<() => Promise<User | null>>;
  activateSubscription: Mock<() => Promise<void>>;
  updateSubscriptionStatus: Mock<() => Promise<void>>;
}

interface MockAuthMiddleware {
  authenticate: Mock<() => Promise<AuthContext>>;
}

function createMocks() {
  const mercadoPagoClient: MockMercadoPagoClient = {
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
        subscriptionId: "sub_456",
        userId: mockUser.id,
      })
    ),
  };

  const userRepo: MockUserRepo = {
    getById: mock(() => Promise.resolve(mockUser)),
    activateSubscription: mock(() => Promise.resolve()),
    updateSubscriptionStatus: mock(() => Promise.resolve()),
  };

  const authMiddleware: MockAuthMiddleware = {
    authenticate: mock(() =>
      Promise.resolve({
        userId: mockUser.id,
        tenantId: mockUser.tenant_id,
        currentTenantId: mockUser.tenant_id,
        role: "owner" as const,
      })
    ),
  };

  const deps: BillingHandlerDeps = {
    mercadoPagoClient: mercadoPagoClient as unknown as MercadoPagoClient,
    userRepo: userRepo as unknown as UserRepository,
    authMiddleware: authMiddleware as unknown as AuthMiddleware,
  };

  return { mercadoPagoClient, userRepo, authMiddleware, deps };
}

describe("createBillingRoutes", () => {
  describe("checkout", () => {
    test("returns checkout URL for authenticated user", async () => {
      const { deps, mercadoPagoClient } = createMocks();
      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.checkout(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { url: string };
      expect(body.url).toBe("https://www.mercadopago.cl/subscriptions/checkout/123");
      expect(mercadoPagoClient.createSubscription).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email
      );
    });

    test("returns 401 when not authenticated", async () => {
      const { deps, authMiddleware } = createMocks();
      authMiddleware.authenticate.mockRejectedValue(
        new AuthenticationError("No session")
      );

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
      });

      const response = await routes.checkout(req);
      expect(response.status).toBe(401);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 404 when user not found", async () => {
      const { deps, userRepo } = createMocks();
      userRepo.getById.mockResolvedValue(null);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.checkout(req);
      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("User not found");
    });

    test("returns 400 when user already subscribed", async () => {
      const { deps, userRepo } = createMocks();
      userRepo.getById.mockResolvedValue(mockPaidUser);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.checkout(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Already subscribed");
    });

    test("returns 500 when MercadoPago fails", async () => {
      const { deps, mercadoPagoClient } = createMocks();
      mercadoPagoClient.createSubscription.mockRejectedValue(
        new Error("MercadoPago error")
      );

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.checkout(req);
      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Failed to create checkout session");
    });
  });

  describe("cancel", () => {
    test("cancels subscription and returns end date", async () => {
      const { deps, userRepo } = createMocks();
      userRepo.getById.mockResolvedValue(mockPaidUser);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/cancel", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.cancel(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { message: string; endsAt: string };
      expect(body.message).toBe("Subscription cancelled");
      expect(body.endsAt).toBe("2025-02-01T00:00:00.000Z");
      expect(userRepo.updateSubscriptionStatus).toHaveBeenCalled();
    });

    test("returns 401 when not authenticated", async () => {
      const { deps, authMiddleware } = createMocks();
      authMiddleware.authenticate.mockRejectedValue(
        new AuthenticationError("No session")
      );

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/cancel", {
        method: "POST",
      });

      const response = await routes.cancel(req);
      expect(response.status).toBe(401);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 404 when user not found", async () => {
      const { deps, userRepo } = createMocks();
      userRepo.getById.mockResolvedValue(null);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/cancel", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.cancel(req);
      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("User not found");
    });

    test("returns 400 when no active subscription", async () => {
      const { deps } = createMocks();

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/cancel", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.cancel(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("No active subscription");
    });

    test("returns 500 when MercadoPago fails", async () => {
      const { deps, userRepo, mercadoPagoClient } = createMocks();
      userRepo.getById.mockResolvedValue(mockPaidUser);
      mercadoPagoClient.cancelSubscription.mockRejectedValue(
        new Error("MercadoPago error")
      );

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/cancel", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.cancel(req);
      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Failed to cancel subscription");
    });
  });

  describe("webhook", () => {
    test("processes subscription_preapproval authorized event", async () => {
      const { deps, userRepo, mercadoPagoClient } = createMocks();
      mercadoPagoClient.processWebhookEvent.mockResolvedValue({
        type: "subscription_authorized",
        subscriptionId: "sub_456",
        userId: mockUser.id,
      });

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({ type: "subscription_preapproval", data: { id: "sub_456" } }),
        headers: {
          "x-signature": "ts=123,v1=valid-hash",
          "x-request-id": "req-123",
        },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);
      expect(userRepo.activateSubscription).toHaveBeenCalledWith(
        mockUser.id,
        "sub_456"
      );
    });

    test("processes subscription_preapproval cancelled event", async () => {
      const { deps, userRepo, mercadoPagoClient } = createMocks();
      const endsAt = new Date("2024-02-15T00:00:00.000Z");
      mercadoPagoClient.processWebhookEvent.mockResolvedValue({
        type: "subscription_cancelled",
        subscriptionId: "sub_456",
        userId: mockUser.id,
        endsAt,
      });

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({ type: "subscription_preapproval", data: { id: "sub_456" } }),
        headers: {
          "x-signature": "ts=123,v1=valid-hash",
          "x-request-id": "req-123",
        },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);
      expect(userRepo.updateSubscriptionStatus).toHaveBeenCalledWith(
        "sub_456",
        "cancelled",
        endsAt
      );
    });

    test("ignores unknown events", async () => {
      const { deps, userRepo, mercadoPagoClient } = createMocks();
      mercadoPagoClient.processWebhookEvent.mockResolvedValue({
        type: "ignored",
        eventType: "payment",
      });

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({ type: "payment", data: { id: "pay_123" } }),
        headers: {
          "x-signature": "ts=123,v1=valid-hash",
          "x-request-id": "req-123",
        },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);
      expect(userRepo.activateSubscription).not.toHaveBeenCalled();
      expect(userRepo.updateSubscriptionStatus).not.toHaveBeenCalled();
    });

    test("returns 400 when x-signature header missing", async () => {
      const { deps } = createMocks();

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({ type: "subscription_preapproval", data: { id: "sub_456" } }),
        headers: {
          "x-request-id": "req-123",
        },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Missing required webhook headers");
    });

    test("returns 400 when x-request-id header missing", async () => {
      const { deps } = createMocks();

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({ type: "subscription_preapproval", data: { id: "sub_456" } }),
        headers: {
          "x-signature": "ts=123,v1=valid-hash",
        },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Missing required webhook headers");
    });

    test("returns 401 when signature validation fails", async () => {
      const { deps, mercadoPagoClient } = createMocks();
      mercadoPagoClient.validateWebhookSignature.mockReturnValue(false);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({ type: "subscription_preapproval", data: { id: "sub_456" } }),
        headers: {
          "x-signature": "ts=123,v1=invalid-hash",
          "x-request-id": "req-123",
        },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(401);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid signature");
    });

    test("returns 400 when payload is invalid", async () => {
      const { deps } = createMocks();

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/mercadopago", {
        method: "POST",
        body: JSON.stringify({ invalid: "payload" }),
        headers: {
          "x-signature": "ts=123,v1=valid-hash",
          "x-request-id": "req-123",
        },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid webhook payload");
    });
  });
});
