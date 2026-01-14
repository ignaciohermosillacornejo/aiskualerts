import { MercadoPagoConfig, PreApproval } from "mercadopago";
import crypto from "crypto";
import { z } from "zod";
import {
  withSpan,
  recordDistribution,
  recordBillingMetrics,
  incrementCounter,
} from "@/monitoring/sentry";

// Config schema
const ConfigSchema = z.object({
  accessToken: z.string().min(1),
  webhookSecret: z.string().min(1).optional(),
  planAmount: z.number().positive(),
  planCurrency: z.string().length(3),
  appUrl: z.url(),
});

export type MercadoPagoClientConfig = z.infer<typeof ConfigSchema>;

// Input validation schemas
const CheckoutInputSchema = z.object({
  tenantId: z.uuid(),
  email: z.email(),
});

// Webhook event result
export type WebhookResult =
  | { type: "subscription_authorized"; subscriptionId: string; tenantId: string }
  | { type: "subscription_cancelled"; subscriptionId: string; tenantId: string }
  | { type: "ignored"; eventType: string };

export class MercadoPagoClient {
  private client: MercadoPagoConfig;
  private preapproval: PreApproval;
  private config: MercadoPagoClientConfig;

  constructor(config: MercadoPagoClientConfig) {
    this.config = ConfigSchema.parse(config);
    this.client = new MercadoPagoConfig({
      accessToken: this.config.accessToken,
      options: { timeout: 5000 },
    });
    this.preapproval = new PreApproval(this.client);
  }

  async createSubscription(tenantId: string, email: string): Promise<string> {
    // Validate inputs before making API calls
    const validated = CheckoutInputSchema.parse({ tenantId, email });
    const startTime = Date.now();

    return withSpan(
      {
        name: "mercadopago preapproval.create",
        op: "api.stripe", // Using existing span op type
        attributes: {
          "mercadopago.operation": "preapproval.create",
          "peer.service": "mercadopago",
        },
      },
      async () => {
        try {
          const response = await this.preapproval.create({
            body: {
              reason: "AISku Alerts Pro",
              external_reference: validated.tenantId,
              payer_email: validated.email,
              auto_recurring: {
                frequency: 1,
                frequency_type: "months",
                transaction_amount: this.config.planAmount,
                currency_id: this.config.planCurrency,
              },
              back_url: `${this.config.appUrl}/billing/success`,
            },
          });

          if (!response.init_point) {
            throw new Error("MercadoPago did not return checkout URL");
          }

          const duration = Date.now() - startTime;
          recordDistribution("mercadopago.api.duration", duration, "millisecond", {
            operation: "preapproval.create",
          });
          incrementCounter("mercadopago.api.requests", 1, {
            operation: "preapproval.create",
            status: "success",
          });

          return response.init_point;
        } catch (error) {
          incrementCounter("mercadopago.api.requests", 1, {
            operation: "preapproval.create",
            status: "error",
          });
          throw error;
        }
      }
    );
  }

  async cancelSubscription(subscriptionId: string): Promise<Date> {
    const startTime = Date.now();

    return withSpan(
      {
        name: "mercadopago preapproval.update",
        op: "api.stripe",
        attributes: {
          "mercadopago.operation": "preapproval.update",
          "peer.service": "mercadopago",
        },
      },
      async () => {
        try {
          const current = await this.preapproval.get({ id: subscriptionId });

          await this.preapproval.update({
            id: subscriptionId,
            body: { status: "cancelled" },
          });

          const duration = Date.now() - startTime;
          recordDistribution("mercadopago.api.duration", duration, "millisecond", {
            operation: "preapproval.cancel",
          });
          incrementCounter("mercadopago.api.requests", 1, {
            operation: "preapproval.cancel",
            status: "success",
          });

          // Return next_payment_date as the end of the current period
          return new Date(current.next_payment_date ?? Date.now());
        } catch (error) {
          incrementCounter("mercadopago.api.requests", 1, {
            operation: "preapproval.cancel",
            status: "error",
          });
          throw error;
        }
      }
    );
  }

  validateWebhookSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string
  ): boolean {
    if (!this.config.webhookSecret) {
      throw new Error("Webhook secret not configured");
    }

    const parts = xSignature.split(",");
    let ts = "";
    let hash = "";

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key?.trim() === "ts") ts = value?.trim() ?? "";
      if (key?.trim() === "v1") hash = value?.trim() ?? "";
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const computed = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(manifest)
      .digest("hex");

    return computed === hash;
  }

  async processWebhookEvent(type: string, dataId: string): Promise<WebhookResult> {
    if (type !== "subscription_preapproval") {
      incrementCounter("mercadopago.webhook.ignored", 1, { event_type: type });
      return { type: "ignored", eventType: type };
    }

    const preapproval = await this.preapproval.get({ id: dataId });
    const tenantId = preapproval.external_reference;

    if (!tenantId) {
      throw new Error("Missing external_reference in preapproval");
    }

    if (!preapproval.id) {
      throw new Error("Missing id in preapproval response");
    }

    if (preapproval.status === "authorized") {
      recordBillingMetrics({
        eventType: "checkout_completed",
        tenantId,
      });

      return {
        type: "subscription_authorized",
        subscriptionId: preapproval.id,
        tenantId,
      };
    }

    if (preapproval.status === "cancelled" || preapproval.status === "paused") {
      recordBillingMetrics({
        eventType: "subscription_deleted",
      });

      return {
        type: "subscription_cancelled",
        subscriptionId: preapproval.id,
        tenantId,
      };
    }

    incrementCounter("mercadopago.webhook.ignored", 1, {
      event_type: `preapproval_${preapproval.status ?? "unknown"}`,
    });
    return { type: "ignored", eventType: `preapproval_${preapproval.status ?? "unknown"}` };
  }
}

// Singleton factory
let mercadoPagoClient: MercadoPagoClient | null = null;

export function getMercadoPagoClient(): MercadoPagoClient {
  if (!mercadoPagoClient) {
    const accessToken = process.env["MERCADOPAGO_ACCESS_TOKEN"];

    if (!accessToken) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN environment variable is required");
    }

    mercadoPagoClient = new MercadoPagoClient({
      accessToken,
      webhookSecret: process.env["MERCADOPAGO_WEBHOOK_SECRET"],
      planAmount: Number(process.env["MERCADOPAGO_PLAN_AMOUNT"]) || 9990,
      planCurrency: process.env["MERCADOPAGO_PLAN_CURRENCY"] ?? "CLP",
      appUrl: process.env["APP_URL"] ?? "http://localhost:3000",
    });
  }
  return mercadoPagoClient;
}

export function resetMercadoPagoClient(): void {
  mercadoPagoClient = null;
}
