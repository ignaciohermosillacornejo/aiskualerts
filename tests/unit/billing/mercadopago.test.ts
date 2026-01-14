/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, mock, beforeEach } from "bun:test";
import crypto from "crypto";
import {
  MercadoPagoClient,
  type MercadoPagoClientConfig,
  type WebhookResult,
} from "@/billing/mercadopago";

// Define mock response types
interface PreApprovalResponse {
  id: string | null;
  init_point?: string | null;
  external_reference: string | null;
  status: string;
  next_payment_date?: string | null;
}

// Mock the mercadopago package
const mockCreate = mock<() => Promise<Partial<PreApprovalResponse>>>(() =>
  Promise.resolve({ init_point: "https://mercadopago.com/checkout/123" })
);
const mockGet = mock<() => Promise<PreApprovalResponse>>(() =>
  Promise.resolve({
    id: "preapproval_123",
    external_reference: "tenant-uuid-123",
    status: "authorized",
    next_payment_date: "2024-02-15T00:00:00.000Z",
  })
);
const mockUpdate = mock<() => Promise<Partial<PreApprovalResponse>>>(() =>
  Promise.resolve({ id: "preapproval_123", status: "cancelled" })
);

// Mock PreApproval class
class MockPreApproval {
  create = mockCreate;
  get = mockGet;
  update = mockUpdate;
}

// Mock MercadoPagoConfig - using function factory instead of class
function createMockMercadoPagoConfig(_config: { accessToken: string; options?: { timeout: number } }) {
  return { accessToken: _config.accessToken };
}

// Replace the mercadopago module imports
void mock.module("mercadopago", () => ({
  MercadoPagoConfig: createMockMercadoPagoConfig,
  PreApproval: MockPreApproval,
}));

// Test configuration
const testConfig: MercadoPagoClientConfig = {
  accessToken: "TEST-ACCESS-TOKEN-123",
  webhookSecret: "test-webhook-secret",
  planAmount: 9990,
  planCurrency: "CLP",
  appUrl: "https://app.example.com",
};

describe("MercadoPagoClient", () => {
  let client: MercadoPagoClient;

  beforeEach(() => {
    // Reset mocks before each test
    mockCreate.mockClear();
    mockGet.mockClear();
    mockUpdate.mockClear();

    // Create fresh client
    client = new MercadoPagoClient(testConfig);
  });

  describe("constructor", () => {
    test("validates config with zod schema", () => {
      expect(() => new MercadoPagoClient(testConfig)).not.toThrow();
    });

    test("throws on invalid accessToken", () => {
      expect(
        () =>
          new MercadoPagoClient({
            ...testConfig,
            accessToken: "",
          })
      ).toThrow();
    });

    test("throws on invalid planCurrency length", () => {
      expect(
        () =>
          new MercadoPagoClient({
            ...testConfig,
            planCurrency: "CLPX",
          })
      ).toThrow();
    });

    test("throws on invalid appUrl", () => {
      expect(
        () =>
          new MercadoPagoClient({
            ...testConfig,
            appUrl: "not-a-url",
          })
      ).toThrow();
    });

    test("allows optional webhookSecret", () => {
      const configWithoutSecret = { ...testConfig };
      delete (configWithoutSecret as Partial<MercadoPagoClientConfig>).webhookSecret;
      expect(() => new MercadoPagoClient(configWithoutSecret)).not.toThrow();
    });
  });

  describe("createSubscription", () => {
    test("returns checkout URL on success", async () => {
      mockCreate.mockResolvedValueOnce({
        init_point: "https://mercadopago.com/checkout/abc123",
      });

      const tenantId = "550e8400-e29b-41d4-a716-446655440000";
      const email = "user@example.com";

      const result = await client.createSubscription(tenantId, email);

      expect(result).toBe("https://mercadopago.com/checkout/abc123");
    });

    test("validates tenant UUID format", async () => {
      const promise = client.createSubscription("invalid-uuid", "user@example.com");
      await expect(promise).rejects.toThrow();
    });

    test("validates email format", async () => {
      const tenantId = "550e8400-e29b-41d4-a716-446655440000";
      const promise = client.createSubscription(tenantId, "invalid-email");
      await expect(promise).rejects.toThrow();
    });

    test("throws when MercadoPago returns no checkout URL", async () => {
      mockCreate.mockResolvedValueOnce({ init_point: null });

      const tenantId = "550e8400-e29b-41d4-a716-446655440000";
      const email = "user@example.com";

      const promise = client.createSubscription(tenantId, email);
      await expect(promise).rejects.toThrow("MercadoPago did not return checkout URL");
    });

    test("propagates API errors", async () => {
      mockCreate.mockRejectedValueOnce(new Error("API Error: rate limited"));

      const tenantId = "550e8400-e29b-41d4-a716-446655440000";
      const email = "user@example.com";

      const promise = client.createSubscription(tenantId, email);
      await expect(promise).rejects.toThrow("API Error: rate limited");
    });
  });

  describe("cancelSubscription", () => {
    test("returns end date from next_payment_date", async () => {
      const expectedDate = new Date("2024-02-15T00:00:00.000Z");
      mockGet.mockResolvedValueOnce({
        id: "preapproval_123",
        external_reference: "tenant-uuid-123",
        next_payment_date: "2024-02-15T00:00:00.000Z",
        status: "authorized",
      });
      mockUpdate.mockResolvedValueOnce({ id: "preapproval_123", status: "cancelled" });

      const result = await client.cancelSubscription("preapproval_123");

      expect(result.getTime()).toBe(expectedDate.getTime());
      expect(mockUpdate).toHaveBeenCalledWith({
        id: "preapproval_123",
        body: { status: "cancelled" },
      });
    });

    test("returns current date when no next_payment_date", async () => {
      const beforeCall = Date.now();
      mockGet.mockResolvedValueOnce({
        id: "preapproval_123",
        external_reference: "tenant-uuid-123",
        next_payment_date: null,
        status: "authorized",
      });
      mockUpdate.mockResolvedValueOnce({ id: "preapproval_123", status: "cancelled" });

      const result = await client.cancelSubscription("preapproval_123");
      const afterCall = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(beforeCall);
      expect(result.getTime()).toBeLessThanOrEqual(afterCall);
    });

    test("propagates API errors", async () => {
      mockGet.mockRejectedValueOnce(new Error("Subscription not found"));

      const promise = client.cancelSubscription("invalid-id");
      await expect(promise).rejects.toThrow("Subscription not found");
    });
  });

  describe("validateWebhookSignature", () => {
    test("returns true for valid signature", () => {
      const dataId = "12345";
      const xRequestId = "req-uuid-789";
      const ts = "1704067200";
      const secret = testConfig.webhookSecret ?? "";
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
      const hash = crypto
        .createHmac("sha256", secret)
        .update(manifest)
        .digest("hex");
      const xSignature = `ts=${ts},v1=${hash}`;

      const result = client.validateWebhookSignature(xSignature, xRequestId, dataId);

      expect(result).toBe(true);
    });

    test("returns false for invalid signature", () => {
      const dataId = "12345";
      const xRequestId = "req-uuid-789";
      const xSignature = "ts=1704067200,v1=invalid-hash-value";

      const result = client.validateWebhookSignature(xSignature, xRequestId, dataId);

      expect(result).toBe(false);
    });

    test("returns false when signature is tampered", () => {
      const dataId = "12345";
      const xRequestId = "req-uuid-789";
      const ts = "1704067200";
      const secret = testConfig.webhookSecret ?? "";
      // Generate signature for different dataId
      const manifest = `id:wrong-id;request-id:${xRequestId};ts:${ts};`;
      const hash = crypto
        .createHmac("sha256", secret)
        .update(manifest)
        .digest("hex");
      const xSignature = `ts=${ts},v1=${hash}`;

      const result = client.validateWebhookSignature(xSignature, xRequestId, dataId);

      expect(result).toBe(false);
    });

    test("throws when webhook secret is not configured", () => {
      const clientWithoutSecret = new MercadoPagoClient({
        ...testConfig,
        webhookSecret: undefined,
      });

      expect(() =>
        clientWithoutSecret.validateWebhookSignature("ts=123,v1=abc", "req-id", "data-id")
      ).toThrow("Webhook secret not configured");
    });

    test("handles malformed signature gracefully", () => {
      // Malformed signature without proper format
      const result = client.validateWebhookSignature(
        "malformed-signature",
        "req-id",
        "data-id"
      );

      expect(result).toBe(false);
    });
  });

  describe("processWebhookEvent", () => {
    test("returns subscription_authorized for authorized preapproval", async () => {
      mockGet.mockResolvedValueOnce({
        id: "preapproval_123",
        external_reference: "tenant-uuid-456",
        status: "authorized",
        next_payment_date: "2024-02-15T00:00:00.000Z",
      });

      const result = await client.processWebhookEvent(
        "subscription_preapproval",
        "preapproval_123"
      );

      expect(result).toEqual({
        type: "subscription_authorized",
        subscriptionId: "preapproval_123",
        tenantId: "tenant-uuid-456",
      } satisfies WebhookResult);
    });

    test("returns subscription_cancelled for cancelled preapproval", async () => {
      mockGet.mockResolvedValueOnce({
        id: "preapproval_789",
        external_reference: "tenant-uuid-abc",
        status: "cancelled",
        next_payment_date: "2024-02-15T00:00:00.000Z",
      });

      const result = await client.processWebhookEvent(
        "subscription_preapproval",
        "preapproval_789"
      );

      expect(result).toEqual({
        type: "subscription_cancelled",
        subscriptionId: "preapproval_789",
        tenantId: "tenant-uuid-abc",
      } satisfies WebhookResult);
    });

    test("returns subscription_cancelled for paused preapproval", async () => {
      mockGet.mockResolvedValueOnce({
        id: "preapproval_pause",
        external_reference: "tenant-uuid-pause",
        status: "paused",
        next_payment_date: "2024-02-15T00:00:00.000Z",
      });

      const result = await client.processWebhookEvent(
        "subscription_preapproval",
        "preapproval_pause"
      );

      expect(result).toEqual({
        type: "subscription_cancelled",
        subscriptionId: "preapproval_pause",
        tenantId: "tenant-uuid-pause",
      } satisfies WebhookResult);
    });

    test("returns ignored for pending preapproval status", async () => {
      mockGet.mockResolvedValueOnce({
        id: "preapproval_pending",
        external_reference: "tenant-uuid-pending",
        status: "pending",
        next_payment_date: "2024-02-15T00:00:00.000Z",
      });

      const result = await client.processWebhookEvent(
        "subscription_preapproval",
        "preapproval_pending"
      );

      expect(result).toEqual({
        type: "ignored",
        eventType: "preapproval_pending",
      } satisfies WebhookResult);
    });

    test("returns ignored for non-subscription_preapproval events", async () => {
      const result = await client.processWebhookEvent("payment", "payment_123");

      expect(result).toEqual({
        type: "ignored",
        eventType: "payment",
      } satisfies WebhookResult);
      expect(mockGet).not.toHaveBeenCalled();
    });

    test("throws when external_reference is missing", async () => {
      mockGet.mockResolvedValueOnce({
        id: "preapproval_no_ref",
        external_reference: null,
        status: "authorized",
        next_payment_date: "2024-02-15T00:00:00.000Z",
      });

      const promise = client.processWebhookEvent("subscription_preapproval", "preapproval_no_ref");
      await expect(promise).rejects.toThrow("Missing external_reference in preapproval");
    });

    test("throws when preapproval id is missing", async () => {
      mockGet.mockResolvedValueOnce({
        id: null,
        external_reference: "tenant-uuid",
        status: "authorized",
        next_payment_date: "2024-02-15T00:00:00.000Z",
      });

      const promise = client.processWebhookEvent("subscription_preapproval", "preapproval_no_id");
      await expect(promise).rejects.toThrow("Missing id in preapproval response");
    });

    test("returns ignored for unknown status", async () => {
      mockGet.mockResolvedValueOnce({
        id: "preapproval_unknown",
        external_reference: "tenant-uuid",
        status: "unknown_status",
        next_payment_date: "2024-02-15T00:00:00.000Z",
      });

      const result = await client.processWebhookEvent(
        "subscription_preapproval",
        "preapproval_unknown"
      );

      expect(result).toEqual({
        type: "ignored",
        eventType: "preapproval_unknown_status",
      } satisfies WebhookResult);
    });
  });
});
