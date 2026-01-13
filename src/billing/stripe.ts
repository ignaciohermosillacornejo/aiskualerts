import Stripe from "stripe";
import { z } from "zod";
import {
  traceStripeApi,
  recordDistribution,
  recordBillingMetrics,
  incrementCounter,
} from "@/monitoring/sentry";

// Config schema
const ConfigSchema = z.object({
  secretKey: z.string().min(1),
  priceId: z.string().min(1),
  webhookSecret: z.string().min(1).optional(),
  appUrl: z.url(),
});

export type StripeConfig = z.infer<typeof ConfigSchema>;

// Input validation schemas
const CheckoutInputSchema = z.object({
  tenantId: z.uuid(),
  email: z.email(),
});

// Checkout session metadata
const CheckoutMetadataSchema = z.object({
  tenant_id: z.uuid(),
});

export type CheckoutMetadata = z.infer<typeof CheckoutMetadataSchema>;

// Webhook event result
export type WebhookResult =
  | { type: "checkout_completed"; tenantId: string; customerId: string }
  | { type: "subscription_deleted"; customerId: string }
  | { type: "ignored"; eventType: string };

export class StripeClient {
  private stripe: Stripe;
  private priceId: string;
  private appUrl: string;
  private webhookSecret: string | undefined;

  constructor(config: StripeConfig) {
    const parsed = ConfigSchema.parse(config);
    this.stripe = new Stripe(parsed.secretKey);
    this.priceId = parsed.priceId;
    this.appUrl = parsed.appUrl;
    this.webhookSecret = parsed.webhookSecret;
  }

  async createCheckoutSession(
    tenantId: string,
    email: string
  ): Promise<string> {
    // Validate inputs before making API calls
    const validated = CheckoutInputSchema.parse({ tenantId, email });
    const startTime = Date.now();

    return traceStripeApi("checkout.sessions.create", async () => {
      try {
        const session = await this.stripe.checkout.sessions.create({
          customer_email: validated.email,
          metadata: { tenant_id: validated.tenantId },
          line_items: [{ price: this.priceId, quantity: 1 }],
          mode: "subscription",
          success_url: `${this.appUrl}/billing/success`,
          cancel_url: `${this.appUrl}/billing/cancel`,
        });

        if (!session.url) {
          throw new Error("Stripe did not return a checkout URL");
        }

        const duration = Date.now() - startTime;
        recordDistribution("stripe.api.duration", duration, "millisecond", {
          operation: "checkout.sessions.create",
        });
        incrementCounter("stripe.api.requests", 1, {
          operation: "checkout.sessions.create",
          status: "success",
        });

        return session.url;
      } catch (error) {
        incrementCounter("stripe.api.requests", 1, {
          operation: "checkout.sessions.create",
          status: "error",
        });
        throw error;
      }
    });
  }

  async createPortalSession(customerId: string): Promise<string> {
    const startTime = Date.now();

    return traceStripeApi("billingPortal.sessions.create", async () => {
      try {
        const session = await this.stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${this.appUrl}/settings`,
        });

        if (!session.url) {
          throw new Error("Stripe did not return a portal URL");
        }

        const duration = Date.now() - startTime;
        recordDistribution("stripe.api.duration", duration, "millisecond", {
          operation: "billingPortal.sessions.create",
        });
        incrementCounter("stripe.api.requests", 1, {
          operation: "billingPortal.sessions.create",
          status: "success",
        });

        return session.url;
      } catch (error) {
        incrementCounter("stripe.api.requests", 1, {
          operation: "billingPortal.sessions.create",
          status: "error",
        });
        throw error;
      }
    });
  }

  parseWebhookEvent(payload: string, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new Error("Webhook secret not configured");
    }
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
  }

  processWebhookEvent(event: Stripe.Event): WebhookResult {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = CheckoutMetadataSchema.safeParse(session.metadata);

        if (!metadata.success) {
          throw new Error("Invalid checkout session metadata");
        }

        if (typeof session.customer !== "string") {
          throw new Error("Expected customer to be a string ID");
        }

        // Record billing metrics
        recordBillingMetrics({
          eventType: "checkout_completed",
          tenantId: metadata.data.tenant_id,
        });

        return {
          type: "checkout_completed",
          tenantId: metadata.data.tenant_id,
          customerId: session.customer,
        };
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        if (typeof subscription.customer !== "string") {
          throw new Error("Expected customer to be a string ID");
        }

        // Record billing metrics
        recordBillingMetrics({
          eventType: "subscription_deleted",
        });

        return {
          type: "subscription_deleted",
          customerId: subscription.customer,
        };
      }

      default:
        incrementCounter("stripe.webhook.ignored", 1, { event_type: event.type });
        return { type: "ignored", eventType: event.type };
    }
  }
}

// Singleton factory
let stripeClient: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  if (!stripeClient) {
    const secretKey = process.env["STRIPE_SECRET_KEY"];
    const priceId = process.env["STRIPE_PRICE_ID"];

    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required");
    }
    if (!priceId) {
      throw new Error("STRIPE_PRICE_ID environment variable is required");
    }

    stripeClient = new StripeClient({
      secretKey,
      priceId,
      webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"],
      appUrl: process.env["APP_URL"] ?? "http://localhost:3000",
    });
  }
  return stripeClient;
}

export function resetStripeClient(): void {
  stripeClient = null;
}
