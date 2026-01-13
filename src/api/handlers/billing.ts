import type { StripeClient } from "@/billing/stripe";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { UserRepository } from "@/db/repositories/user";
import type { AuthMiddleware } from "@/api/middleware/auth";
import { logger } from "@/utils/logger";

export interface BillingHandlerDeps {
  stripeClient: StripeClient;
  tenantRepo: TenantRepository;
  userRepo: UserRepository;
  authMiddleware: AuthMiddleware;
}

export interface BillingRoutes {
  checkout: (req: Request) => Promise<Response>;
  portal: (req: Request) => Promise<Response>;
  webhook: (req: Request) => Promise<Response>;
}

export function createBillingRoutes(deps: BillingHandlerDeps): BillingRoutes {
  const { stripeClient, tenantRepo, userRepo, authMiddleware } = deps;

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

        if (tenant.is_paid) {
          return Response.json(
            { error: "Already subscribed" },
            { status: 400 }
          );
        }

        const checkoutUrl = await stripeClient.createCheckoutSession(
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

    async portal(req: Request): Promise<Response> {
      try {
        const authContext = await authMiddleware.authenticate(req);
        const tenant = await tenantRepo.getById(authContext.tenantId);

        if (!tenant) {
          return Response.json({ error: "Tenant not found" }, { status: 404 });
        }

        if (!tenant.stripe_customer_id) {
          return Response.json(
            { error: "No active subscription" },
            { status: 400 }
          );
        }

        const portalUrl = await stripeClient.createPortalSession(
          tenant.stripe_customer_id
        );

        return Response.json({ url: portalUrl });
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationError") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        logger.error("Portal error", error instanceof Error ? error : new Error(String(error)));
        return Response.json(
          { error: "Failed to create portal session" },
          { status: 500 }
        );
      }
    },

    async webhook(req: Request): Promise<Response> {
      try {
        const body = await req.text();
        const signature = req.headers.get("stripe-signature");

        if (!signature) {
          return Response.json(
            { error: "Missing stripe-signature header" },
            { status: 400 }
          );
        }

        const event = stripeClient.parseWebhookEvent(body, signature);
        const result = stripeClient.processWebhookEvent(event);

        switch (result.type) {
          case "checkout_completed":
            await tenantRepo.updateStripeCustomer(
              result.tenantId,
              result.customerId
            );
            break;

          case "subscription_deleted":
            await tenantRepo.updatePaidStatus(result.customerId, false);
            break;

          case "ignored":
            break;
        }

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
