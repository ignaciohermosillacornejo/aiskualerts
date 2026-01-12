import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  StripeClient,
  getStripeClient,
  resetStripeClient,
  type StripeConfig,
} from "@/billing/stripe";
import type Stripe from "stripe";

const validConfig: StripeConfig = {
  secretKey: "sk_test_123",
  priceId: "price_123",
  webhookSecret: "whsec_123",
  appUrl: "https://example.com",
};

interface CheckoutCreateParams {
  customer_email: string;
  metadata: { tenant_id: string };
  line_items: { price: string; quantity: number }[];
  mode: string;
  success_url: string;
  cancel_url: string;
}

interface PortalCreateParams {
  customer: string;
  return_url: string;
}

// Track call arguments
let lastCheckoutParams: CheckoutCreateParams | null = null;
let lastPortalParams: PortalCreateParams | null = null;
let checkoutUrlToReturn: string | null = "https://checkout.stripe.com/session123";

// Mock Stripe module
const mockCheckoutCreate = mock((params: CheckoutCreateParams) => {
  lastCheckoutParams = params;
  return Promise.resolve({ url: checkoutUrlToReturn });
});

const mockPortalCreate = mock((params: PortalCreateParams) => {
  lastPortalParams = params;
  return Promise.resolve({ url: "https://billing.stripe.com/portal123" });
});

const mockConstructEvent = mock((payload: string) => {
  return JSON.parse(payload) as Stripe.Event;
});

// Store original Stripe constructor
let originalStripeModule: typeof import("stripe");

beforeEach(async () => {
  resetStripeClient();
  lastCheckoutParams = null;
  lastPortalParams = null;
  checkoutUrlToReturn = "https://checkout.stripe.com/session123";
  originalStripeModule = await import("stripe");

  // Mock the Stripe constructor
  const MockStripe = function (this: unknown) {
    return {
      checkout: {
        sessions: {
          create: mockCheckoutCreate,
        },
      },
      billingPortal: {
        sessions: {
          create: mockPortalCreate,
        },
      },
      webhooks: {
        constructEvent: mockConstructEvent,
      },
    };
  } as unknown as typeof Stripe;

  // Replace the module
  await mock.module("stripe", () => ({
    default: MockStripe,
  }));

  mockCheckoutCreate.mockClear();
  mockPortalCreate.mockClear();
  mockConstructEvent.mockClear();
});

afterEach(async () => {
  resetStripeClient();
  await mock.module("stripe", () => originalStripeModule);
});

test("StripeClient constructor validates config", () => {
  expect(() => new StripeClient(validConfig)).not.toThrow();
});

test("StripeClient constructor rejects invalid secretKey", () => {
  expect(() => new StripeClient({ ...validConfig, secretKey: "" })).toThrow();
});

test("StripeClient constructor rejects invalid priceId", () => {
  expect(() => new StripeClient({ ...validConfig, priceId: "" })).toThrow();
});

test("StripeClient constructor rejects invalid appUrl", () => {
  expect(
    () => new StripeClient({ ...validConfig, appUrl: "not-a-url" })
  ).toThrow();
});

test("StripeClient constructor allows undefined webhookSecret", () => {
  const configWithoutWebhook = { ...validConfig };
  delete (configWithoutWebhook as Partial<StripeConfig>).webhookSecret;
  expect(() => new StripeClient(configWithoutWebhook)).not.toThrow();
});

test("createCheckoutSession returns checkout URL", async () => {
  const client = new StripeClient(validConfig);
  const url = await client.createCheckoutSession(
    "550e8400-e29b-41d4-a716-446655440000",
    "test@example.com"
  );

  expect(url).toBe("https://checkout.stripe.com/session123");
  expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);
  expect(lastCheckoutParams).not.toBeNull();
  expect(lastCheckoutParams?.customer_email).toBe("test@example.com");
  expect(lastCheckoutParams?.metadata.tenant_id).toBe(
    "550e8400-e29b-41d4-a716-446655440000"
  );
  expect(lastCheckoutParams?.line_items[0]?.price).toBe("price_123");
  expect(lastCheckoutParams?.mode).toBe("subscription");
  expect(lastCheckoutParams?.success_url).toBe(
    "https://example.com/billing/success"
  );
  expect(lastCheckoutParams?.cancel_url).toBe(
    "https://example.com/billing/cancel"
  );
});

test("createCheckoutSession throws if Stripe returns no URL", async () => {
  checkoutUrlToReturn = null;

  const client = new StripeClient(validConfig);
  let error: Error | null = null;
  try {
    await client.createCheckoutSession(
      "550e8400-e29b-41d4-a716-446655440000",
      "test@example.com"
    );
  } catch (e) {
    error = e as Error;
  }
  expect(error).not.toBeNull();
  expect(error?.message).toBe("Stripe did not return a checkout URL");
});

test("createCheckoutSession throws on invalid email", async () => {
  const client = new StripeClient(validConfig);
  let error: Error | null = null;
  try {
    await client.createCheckoutSession(
      "550e8400-e29b-41d4-a716-446655440000",
      "not-an-email"
    );
  } catch (e) {
    error = e as Error;
  }
  expect(error).not.toBeNull();
});

test("createCheckoutSession throws on invalid tenantId", async () => {
  const client = new StripeClient(validConfig);
  let error: Error | null = null;
  try {
    await client.createCheckoutSession("not-a-uuid", "test@example.com");
  } catch (e) {
    error = e as Error;
  }
  expect(error).not.toBeNull();
});

test("createPortalSession returns portal URL", async () => {
  const client = new StripeClient(validConfig);
  const url = await client.createPortalSession("cus_123");

  expect(url).toBe("https://billing.stripe.com/portal123");
  expect(mockPortalCreate).toHaveBeenCalledTimes(1);
  expect(lastPortalParams).not.toBeNull();
  expect(lastPortalParams?.customer).toBe("cus_123");
  expect(lastPortalParams?.return_url).toBe("https://example.com/settings");
});

test("createPortalSession throws if Stripe returns no URL", async () => {
  mockPortalCreate.mockResolvedValueOnce({ url: null as unknown as string });

  const client = new StripeClient(validConfig);
  let error: Error | null = null;
  try {
    await client.createPortalSession("cus_123");
  } catch (e) {
    error = e as Error;
  }
  expect(error).not.toBeNull();
  expect(error?.message).toBe("Stripe did not return a portal URL");
});

test("parseWebhookEvent throws if webhook secret not configured", () => {
  const configWithoutWebhook: StripeConfig = {
    ...validConfig,
    webhookSecret: undefined,
  };
  const client = new StripeClient(configWithoutWebhook);

  expect(() => client.parseWebhookEvent("{}", "sig")).toThrow(
    "Webhook secret not configured"
  );
});

test("parseWebhookEvent calls Stripe constructEvent", () => {
  const client = new StripeClient(validConfig);
  const payload = JSON.stringify({ type: "test.event" });

  client.parseWebhookEvent(payload, "test_signature");

  expect(mockConstructEvent).toHaveBeenCalledWith(
    payload,
    "test_signature",
    "whsec_123"
  );
});

test("processWebhookEvent handles checkout.session.completed", () => {
  const client = new StripeClient(validConfig);
  const event: Stripe.Event = {
    id: "evt_123",
    type: "checkout.session.completed",
    object: "event",
    api_version: "2025-12-17.acacia",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {
        id: "cs_123",
        object: "checkout.session",
        customer: "cus_456",
        metadata: {
          tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as unknown as Stripe.Checkout.Session,
    },
  };

  const result = client.processWebhookEvent(event);

  expect(result).toEqual({
    type: "checkout_completed",
    tenantId: "550e8400-e29b-41d4-a716-446655440000",
    customerId: "cus_456",
  });
});

test("processWebhookEvent throws on invalid checkout metadata", () => {
  const client = new StripeClient(validConfig);
  const event: Stripe.Event = {
    id: "evt_123",
    type: "checkout.session.completed",
    object: "event",
    api_version: "2025-12-17.acacia",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {
        id: "cs_123",
        object: "checkout.session",
        customer: "cus_456",
        metadata: {
          tenant_id: "not-a-uuid",
        },
      } as unknown as Stripe.Checkout.Session,
    },
  };

  expect(() => client.processWebhookEvent(event)).toThrow(
    "Invalid checkout session metadata"
  );
});

test("processWebhookEvent throws if customer is not a string", () => {
  const client = new StripeClient(validConfig);
  const event: Stripe.Event = {
    id: "evt_123",
    type: "checkout.session.completed",
    object: "event",
    api_version: "2025-12-17.acacia",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {
        id: "cs_123",
        object: "checkout.session",
        customer: { id: "cus_456" }, // Object instead of string
        metadata: {
          tenant_id: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as unknown as Stripe.Checkout.Session,
    },
  };

  expect(() => client.processWebhookEvent(event)).toThrow(
    "Expected customer to be a string ID"
  );
});

test("processWebhookEvent handles customer.subscription.deleted", () => {
  const client = new StripeClient(validConfig);
  const event: Stripe.Event = {
    id: "evt_123",
    type: "customer.subscription.deleted",
    object: "event",
    api_version: "2025-12-17.acacia",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {
        id: "sub_123",
        object: "subscription",
        customer: "cus_456",
      } as unknown as Stripe.Subscription,
    },
  };

  const result = client.processWebhookEvent(event);

  expect(result).toEqual({
    type: "subscription_deleted",
    customerId: "cus_456",
  });
});

test("processWebhookEvent throws if subscription customer is not a string", () => {
  const client = new StripeClient(validConfig);
  const event: Stripe.Event = {
    id: "evt_123",
    type: "customer.subscription.deleted",
    object: "event",
    api_version: "2025-12-17.acacia",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {
        id: "sub_123",
        object: "subscription",
        customer: { id: "cus_456" }, // Object instead of string
      } as unknown as Stripe.Subscription,
    },
  };

  expect(() => client.processWebhookEvent(event)).toThrow(
    "Expected customer to be a string ID"
  );
});

test("processWebhookEvent ignores unknown events", () => {
  const client = new StripeClient(validConfig);
  const event: Stripe.Event = {
    id: "evt_123",
    type: "invoice.paid",
    object: "event",
    api_version: "2025-12-17.acacia",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {} as Stripe.Invoice,
    },
  };

  const result = client.processWebhookEvent(event);

  expect(result).toEqual({
    type: "ignored",
    eventType: "invoice.paid",
  });
});

test("getStripeClient returns singleton instance", () => {
  // Set env vars for the singleton
  process.env["STRIPE_SECRET_KEY"] = "sk_test_singleton";
  process.env["STRIPE_PRICE_ID"] = "price_singleton";
  process.env["APP_URL"] = "https://singleton.example.com";

  const client1 = getStripeClient();
  const client2 = getStripeClient();

  expect(client1).toBe(client2);

  // Cleanup
  delete process.env["STRIPE_SECRET_KEY"];
  delete process.env["STRIPE_PRICE_ID"];
  delete process.env["APP_URL"];
});

test("resetStripeClient clears singleton", () => {
  process.env["STRIPE_SECRET_KEY"] = "sk_test_reset";
  process.env["STRIPE_PRICE_ID"] = "price_reset";
  process.env["APP_URL"] = "https://reset.example.com";

  const client1 = getStripeClient();
  resetStripeClient();

  process.env["STRIPE_SECRET_KEY"] = "sk_test_reset2";
  const client2 = getStripeClient();

  expect(client1).not.toBe(client2);

  // Cleanup
  delete process.env["STRIPE_SECRET_KEY"];
  delete process.env["STRIPE_PRICE_ID"];
  delete process.env["APP_URL"];
});

test("getStripeClient throws when STRIPE_SECRET_KEY is missing", () => {
  resetStripeClient();
  delete process.env["STRIPE_SECRET_KEY"];
  process.env["STRIPE_PRICE_ID"] = "price_123";

  expect(() => getStripeClient()).toThrow(
    "STRIPE_SECRET_KEY environment variable is required"
  );

  // Cleanup
  delete process.env["STRIPE_PRICE_ID"];
});

test("getStripeClient throws when STRIPE_PRICE_ID is missing", () => {
  resetStripeClient();
  process.env["STRIPE_SECRET_KEY"] = "sk_test_123";
  delete process.env["STRIPE_PRICE_ID"];

  expect(() => getStripeClient()).toThrow(
    "STRIPE_PRICE_ID environment variable is required"
  );

  // Cleanup
  delete process.env["STRIPE_SECRET_KEY"];
});
