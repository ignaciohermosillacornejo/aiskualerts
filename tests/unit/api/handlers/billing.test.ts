import { test, expect, describe, mock, type Mock } from "bun:test";
import {
  createBillingRoutes,
  type BillingHandlerDeps,
} from "@/api/handlers/billing";
import type { StripeClient, WebhookResult } from "@/billing/stripe";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { UserRepository } from "@/db/repositories/user";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import type { Tenant, User } from "@/db/repositories/types";
import { AuthenticationError } from "@/api/middleware/auth";
import type Stripe from "stripe";

const mockTenant: Tenant = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  bsale_client_code: "12345678-9",
  bsale_client_name: "Test Company",
  bsale_access_token: "test-token",
  sync_status: "pending",
  last_sync_at: null,
  stripe_customer_id: null,
  is_paid: false,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPaidTenant: Tenant = {
  ...mockTenant,
  stripe_customer_id: "cus_123",
  is_paid: true,
};

const mockUser: User = {
  id: "user-123",
  tenant_id: mockTenant.id,
  email: "test@example.com",
  name: "Test User",
  notification_enabled: true,
  notification_email: null,
  created_at: new Date(),
};

interface MockStripeClient {
  createCheckoutSession: Mock<() => Promise<string>>;
  createPortalSession: Mock<() => Promise<string>>;
  parseWebhookEvent: Mock<() => Stripe.Event>;
  processWebhookEvent: Mock<() => WebhookResult>;
}

interface MockTenantRepo {
  getById: Mock<() => Promise<Tenant | null>>;
  updateStripeCustomer: Mock<() => Promise<void>>;
  updatePaidStatus: Mock<() => Promise<void>>;
}

interface MockUserRepo {
  getById: Mock<() => Promise<User | null>>;
}

interface MockAuthMiddleware {
  authenticate: Mock<() => Promise<AuthContext>>;
}

function createMocks() {
  const stripeClient: MockStripeClient = {
    createCheckoutSession: mock(() =>
      Promise.resolve("https://checkout.stripe.com/session123")
    ),
    createPortalSession: mock(() =>
      Promise.resolve("https://billing.stripe.com/portal123")
    ),
    parseWebhookEvent: mock(
      () =>
        ({
          type: "checkout.session.completed",
          id: "evt_123",
        }) as Stripe.Event
    ),
    processWebhookEvent: mock(() => ({
      type: "checkout_completed" as const,
      tenantId: mockTenant.id,
      customerId: "cus_456",
    })),
  };

  const tenantRepo: MockTenantRepo = {
    getById: mock(() => Promise.resolve(mockTenant)),
    updateStripeCustomer: mock(() => Promise.resolve()),
    updatePaidStatus: mock(() => Promise.resolve()),
  };

  const userRepo: MockUserRepo = {
    getById: mock(() => Promise.resolve(mockUser)),
  };

  const authMiddleware: MockAuthMiddleware = {
    authenticate: mock(() =>
      Promise.resolve({
        userId: mockUser.id,
        tenantId: mockTenant.id,
      })
    ),
  };

  const deps: BillingHandlerDeps = {
    stripeClient: stripeClient as unknown as StripeClient,
    tenantRepo: tenantRepo as unknown as TenantRepository,
    userRepo: userRepo as unknown as UserRepository,
    authMiddleware: authMiddleware as unknown as AuthMiddleware,
  };

  return { stripeClient, tenantRepo, userRepo, authMiddleware, deps };
}

describe("createBillingRoutes", () => {
  describe("checkout", () => {
    test("returns checkout URL for authenticated user", async () => {
      const { deps } = createMocks();
      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.checkout(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { url: string };
      expect(body.url).toBe("https://checkout.stripe.com/session123");
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

    test("returns 404 when tenant not found", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockResolvedValue(null);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.checkout(req);
      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Tenant not found");
    });

    test("returns 400 when already subscribed", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockResolvedValue(mockPaidTenant);

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

    test("returns 500 when Stripe fails", async () => {
      const { deps, stripeClient } = createMocks();
      stripeClient.createCheckoutSession.mockRejectedValue(
        new Error("Stripe error")
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

  describe("portal", () => {
    test("returns portal URL for subscribed tenant", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockResolvedValue(mockPaidTenant);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.portal(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { url: string };
      expect(body.url).toBe("https://billing.stripe.com/portal123");
    });

    test("returns 401 when not authenticated", async () => {
      const { deps, authMiddleware } = createMocks();
      authMiddleware.authenticate.mockRejectedValue(
        new AuthenticationError("No session")
      );

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/portal", {
        method: "POST",
      });

      const response = await routes.portal(req);
      expect(response.status).toBe(401);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 404 when tenant not found", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockResolvedValue(null);

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.portal(req);
      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Tenant not found");
    });

    test("returns 400 when no active subscription", async () => {
      const { deps } = createMocks();

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.portal(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("No active subscription");
    });

    test("returns 500 when Stripe fails", async () => {
      const { deps, tenantRepo, stripeClient } = createMocks();
      tenantRepo.getById.mockResolvedValue(mockPaidTenant);
      stripeClient.createPortalSession.mockRejectedValue(
        new Error("Stripe error")
      );

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.portal(req);
      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Failed to create portal session");
    });
  });

  describe("webhook", () => {
    test("processes checkout.session.completed event", async () => {
      const { deps, tenantRepo, stripeClient } = createMocks();
      stripeClient.processWebhookEvent.mockReturnValue({
        type: "checkout_completed",
        tenantId: mockTenant.id,
        customerId: "cus_456",
      });

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ type: "checkout.session.completed" }),
        headers: { "stripe-signature": "valid-signature" },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);
      expect(tenantRepo.updateStripeCustomer).toHaveBeenCalled();
    });

    test("processes customer.subscription.deleted event", async () => {
      const { deps, tenantRepo, stripeClient } = createMocks();
      stripeClient.processWebhookEvent.mockReturnValue({
        type: "subscription_deleted",
        customerId: "cus_456",
      });

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.deleted" }),
        headers: { "stripe-signature": "valid-signature" },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);
      expect(tenantRepo.updatePaidStatus).toHaveBeenCalled();
    });

    test("ignores unknown events", async () => {
      const { deps, tenantRepo, stripeClient } = createMocks();
      stripeClient.processWebhookEvent.mockReturnValue({
        type: "ignored",
        eventType: "invoice.paid",
      });

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ type: "invoice.paid" }),
        headers: { "stripe-signature": "valid-signature" },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);
      expect(tenantRepo.updateStripeCustomer).not.toHaveBeenCalled();
      expect(tenantRepo.updatePaidStatus).not.toHaveBeenCalled();
    });

    test("returns 400 when stripe-signature header missing", async () => {
      const { deps } = createMocks();

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Missing stripe-signature header");
    });

    test("returns 400 when webhook verification fails", async () => {
      const { deps, stripeClient } = createMocks();
      stripeClient.parseWebhookEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const routes = createBillingRoutes(deps);

      const req = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ type: "checkout.session.completed" }),
        headers: { "stripe-signature": "invalid-signature" },
      });

      const response = await routes.webhook(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Webhook processing failed");
    });
  });
});
