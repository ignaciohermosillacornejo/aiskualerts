import type { MercadoPagoClient } from "@/billing/mercadopago";
import type { UserRepository } from "@/db/repositories/user";
import type { AuthMiddleware } from "@/api/middleware/auth";
import { isUserPaid } from "@/billing/plans";
import { logger } from "@/utils/logger";

export interface BillingHandlerDeps {
  mercadoPagoClient: MercadoPagoClient;
  userRepo: UserRepository;
  authMiddleware: AuthMiddleware;
}

export interface BillingRoutes {
  checkout: (req: Request) => Promise<Response>;
  cancel: (req: Request) => Promise<Response>;
  webhook: (req: Request) => Promise<Response>;
}

export function createBillingRoutes(deps: BillingHandlerDeps): BillingRoutes {
  const { mercadoPagoClient, userRepo, authMiddleware } = deps;

  return {
    async checkout(req: Request): Promise<Response> {
      try {
        const authContext = await authMiddleware.authenticate(req);
        const user = await userRepo.getById(authContext.userId);

        if (!user) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        if (isUserPaid(user)) {
          return Response.json(
            { error: "Already subscribed" },
            { status: 400 }
          );
        }

        const checkoutUrl = await mercadoPagoClient.createSubscription(
          authContext.userId,
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
        const user = await userRepo.getById(authContext.userId);

        if (!user) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.subscription_id) {
          return Response.json(
            { error: "No active subscription" },
            { status: 400 }
          );
        }

        const endsAt = await mercadoPagoClient.cancelSubscription(
          user.subscription_id
        );

        await userRepo.updateSubscriptionStatus(
          user.subscription_id,
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
            await userRepo.activateSubscription(
              result.userId,
              result.subscriptionId
            );
            break;

          case "subscription_cancelled":
            await userRepo.updateSubscriptionStatus(
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
