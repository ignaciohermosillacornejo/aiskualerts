import Stripe from "stripe";
import { z } from "zod";

// Config schema
const ConfigSchema = z.object({
  secretKey: z.string().min(1),
  priceId: z.string().min(1),
  webhookSecret: z.string().min(1).optional(),
  appUrl: z.string().url(),
});

export type StripeConfig = z.infer<typeof ConfigSchema>;

// Checkout session metadata
const CheckoutMetadataSchema = z.object({
  tenant_id: z.string().uuid(),
});

export type CheckoutMetadata = z.infer<typeof CheckoutMetadataSchema>;

// Webhook event result
export type WebhookResult =
  | { type: "checkout_completed"; tenantId: string; customerId: string }
  | { type: "subscription_created"; customerId: string; subscriptionId: string }
  | { type: "subscription_deleted"; customerId: string }
  | { type: "subscription_paused"; customerId: string }
  | { type: "subscription_resumed"; customerId: string }
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
    const session = await this.stripe.checkout.sessions.create({
      customer_email: email,
      metadata: { tenant_id: tenantId },
      line_items: [{ price: this.priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${this.appUrl}/billing/success`,
      cancel_url: `${this.appUrl}/billing/cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return session.url;
  }

  async createPortalSession(customerId: string): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.appUrl}/settings`,
    });

    return session.url;
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

        return {
          type: "checkout_completed",
          tenantId: metadata.data.tenant_id,
          customerId: session.customer,
        };
      }

      case "customer.subscription.created": {
        // TODO: Handle new subscription created
        // Use case: Could trigger welcome email, initial sync, or logging
        const subscription = event.data.object;

        if (typeof subscription.customer !== "string") {
          throw new Error("Expected customer to be a string ID");
        }

        return {
          type: "subscription_created",
          customerId: subscription.customer,
          subscriptionId: subscription.id,
        };
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        if (typeof subscription.customer !== "string") {
          throw new Error("Expected customer to be a string ID");
        }

        return {
          type: "subscription_deleted",
          customerId: subscription.customer,
        };
      }

      case "customer.subscription.paused": {
        // TODO: Handle subscription paused
        // Use case: Disable alerts/sync while paused, notify user
        const subscription = event.data.object;

        if (typeof subscription.customer !== "string") {
          throw new Error("Expected customer to be a string ID");
        }

        return {
          type: "subscription_paused",
          customerId: subscription.customer,
        };
      }

      case "customer.subscription.resumed": {
        // TODO: Handle subscription resumed
        // Use case: Re-enable alerts/sync, trigger catch-up sync
        const subscription = event.data.object;

        if (typeof subscription.customer !== "string") {
          throw new Error("Expected customer to be a string ID");
        }

        return {
          type: "subscription_resumed",
          customerId: subscription.customer,
        };
      }

      default:
        return { type: "ignored", eventType: event.type };
    }
  }
}

// Singleton factory
let stripeClient: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  stripeClient ??= new StripeClient({
    secretKey: process.env["STRIPE_SECRET_KEY"] ?? "",
    priceId: process.env["STRIPE_PRICE_ID"] ?? "",
    webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"],
    appUrl: process.env["APP_URL"] ?? "http://localhost:3000",
  });
  return stripeClient;
}

export function resetStripeClient(): void {
  stripeClient = null;
}
