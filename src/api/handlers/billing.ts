import type { MercadoPagoClient } from "@/billing/mercadopago";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { UserRepository } from "@/db/repositories/user";
import type { AuthMiddleware } from "@/api/middleware/auth";
import { isTenantPaid } from "@/db/repositories/types";
import { logger } from "@/utils/logger";

export interface BillingHandlerDeps {
  mercadoPagoClient: MercadoPagoClient;
  tenantRepo: TenantRepository;
  userRepo: UserRepository;
  authMiddleware: AuthMiddleware;
}

export interface BillingRoutes {
  checkout: (req: Request) => Promise<Response>;
  cancel: (req: Request) => Promise<Response>;
  webhook: (req: Request) => Promise<Response>;
}

export function createBillingRoutes(deps: BillingHandlerDeps): BillingRoutes {
  const { mercadoPagoClient, tenantRepo, userRepo, authMiddleware } = deps;

  return {
    async checkout(req: Request): Promise<Response> {
      try {
        const authContext = await authMiddleware.authenticate(req);
        const user = await userRepo.getById(authContext.userId);

        if (!user) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        const tenant = await tenantRepo.getById(authContext.tenantId);

        if (!tenant) {
          return Response.json({ error: "Tenant not found" }, { status: 404 });
        }

        if (isTenantPaid(tenant)) {
          return Response.json(
            { error: "Already subscribed" },
            { status: 400 }
          );
        }

        const checkoutUrl = await mercadoPagoClient.createSubscription(
          authContext.tenantId,
          user.email
        );

        return Response.json({ url: checkoutUrl });
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationError") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        logger.error("Checkout error", error instanceof Error ? error : new Error(String(error)));
        return Response.json(
          { error: "Failed to create checkout session" },
          { status: 500 }
        );
      }
    },

    async cancel(req: Request): Promise<Response> {
      try {
        const authContext = await authMiddleware.authenticate(req);
        const tenant = await tenantRepo.getById(authContext.tenantId);

        if (!tenant) {
          return Response.json({ error: "Tenant not found" }, { status: 404 });
        }

        if (!tenant.subscription_id) {
          return Response.json(
            { error: "No active subscription" },
            { status: 400 }
          );
        }

        const endsAt = await mercadoPagoClient.cancelSubscription(
          tenant.subscription_id
        );

        await tenantRepo.updateSubscriptionStatus(
          tenant.subscription_id,
          "cancelled",
          endsAt
        );

        return Response.json({
          message: "Subscription cancelled",
          endsAt: endsAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationError") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        logger.error("Cancel error", error instanceof Error ? error : new Error(String(error)));
        return Response.json(
          { error: "Failed to cancel subscription" },
          { status: 500 }
        );
      }
    },

    async webhook(req: Request): Promise<Response> {
      try {
        const body = await req.text();
        const xSignature = req.headers.get("x-signature");
        const xRequestId = req.headers.get("x-request-id");

        if (!xSignature || !xRequestId) {
          return Response.json(
            { error: "Missing required webhook headers" },
            { status: 400 }
          );
        }

        const payload = JSON.parse(body) as { type?: string; data?: { id?: string } };
        const eventType = payload.type;
        const dataId = payload.data?.id;

        if (!eventType || !dataId) {
          return Response.json(
            { error: "Invalid webhook payload" },
            { status: 400 }
          );
        }

        // Validate signature
        const isValid = mercadoPagoClient.validateWebhookSignature(
          xSignature,
          xRequestId,
          dataId
        );

        if (!isValid) {
          return Response.json(
            { error: "Invalid signature" },
            { status: 401 }
          );
        }

        const result = await mercadoPagoClient.processWebhookEvent(eventType, dataId);

        switch (result.type) {
          case "subscription_authorized":
            await tenantRepo.activateSubscription(
              result.tenantId,
              result.subscriptionId
            );
            break;

          case "subscription_cancelled":
            await tenantRepo.updateSubscriptionStatus(
              result.subscriptionId,
              "cancelled",
              result.endsAt
            );
            break;

          case "ignored":
            break;
        }

        // MercadoPago requires 200 OK response
        return Response.json({ received: true });
      } catch (error) {
        logger.error("Webhook error", error instanceof Error ? error : new Error(String(error)));
        return Response.json(
          { error: "Webhook processing failed" },
          { status: 400 }
        );
      }
    },
  };
}
