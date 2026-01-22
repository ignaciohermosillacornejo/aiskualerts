/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { api, ApiError } from "../../../src/frontend/api/client";

// Store original fetch
const originalFetch = globalThis.fetch;

// Store original document
const originalDocument = globalThis.document;

describe("API Client", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: "test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    // Mock document.cookie for CSRF token extraction
    globalThis.document = {
      cookie: "csrf_token=test-csrf-token",
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  });

  describe("ApiError", () => {
    test("creates error with message and status", () => {
      const error = new ApiError("Not found", 404);
      expect(error.message).toBe("Not found");
      expect(error.status).toBe(404);
      expect(error.name).toBe("ApiError");
    });

    test("is instance of Error", () => {
      const error = new ApiError("Test", 500);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("getDashboardStats", () => {
    test("fetches dashboard stats", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              totalProducts: 100,
              activeAlerts: 5,
              lowStockProducts: 10,
              configuredThresholds: 25,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );

      const stats = await api.getDashboardStats();

      expect(mockFetch).toHaveBeenCalledWith("/api/dashboard/stats", expect.any(Object));
      expect(stats.totalProducts).toBe(100);
      expect(stats.activeAlerts).toBe(5);
    });
  });

  describe("getAlerts", () => {
    test("fetches alerts without options", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ alerts: [], total: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getAlerts();

      expect(mockFetch).toHaveBeenCalledWith("/api/alerts", expect.any(Object));
    });

    test("fetches alerts with type filter", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ alerts: [], total: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getAlerts({ type: "threshold_breach" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/alerts?type=threshold_breach",
        expect.any(Object)
      );
    });

    test("fetches alerts with limit and offset", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ alerts: [], total: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getAlerts({ limit: 10, offset: 20 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/alerts?limit=10&offset=20",
        expect.any(Object)
      );
    });
  });

  describe("dismissAlert", () => {
    test("sends POST request to dismiss alert", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.dismissAlert("alert-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/alerts/alert-123/dismiss",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("getProducts", () => {
    test("fetches products list with high limit", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [], pagination: { total: 0, page: 1, limit: 1000, totalPages: 0 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getProducts();

      expect(mockFetch).toHaveBeenCalledWith("/api/products?limit=1000", expect.any(Object));
    });
  });

  describe("getProduct", () => {
    test("fetches single product by ID", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "p1", name: "Product" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const product = await api.getProduct("p1");

      expect(mockFetch).toHaveBeenCalledWith("/api/products/p1", expect.any(Object));
      expect(product.id).toBe("p1");
    });
  });

  describe("getThresholds", () => {
    test("fetches thresholds list", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getThresholds();

      expect(mockFetch).toHaveBeenCalledWith("/api/thresholds", expect.any(Object));
    });
  });

  describe("createThreshold", () => {
    test("sends POST request with validated data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "t1", productId: "p1", minQuantity: 10 }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const result = await api.createThreshold({ productId: "p1", thresholdType: "quantity", minQuantity: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/thresholds",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ productId: "p1", thresholdType: "quantity", minQuantity: 10 }),
        })
      );
      expect(result.productId).toBe("p1");
    });

    test("validates input before sending", async () => {
      await expect(
        api.createThreshold({ productId: "", thresholdType: "quantity", minQuantity: 10 })
      ).rejects.toThrow();
    });

    test("rejects negative quantity", async () => {
      await expect(
        api.createThreshold({ productId: "p1", thresholdType: "quantity", minQuantity: -5 })
      ).rejects.toThrow();
    });

    test("creates days-based threshold", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "t2", productId: "p1", thresholdType: "days", minDays: 7 }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const result = await api.createThreshold({ productId: "p1", thresholdType: "days", minDays: 7 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/thresholds",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ productId: "p1", thresholdType: "days", minDays: 7 }),
        })
      );
      expect(result.productId).toBe("p1");
    });

    test("rejects quantity type without minQuantity", async () => {
      await expect(
        api.createThreshold({ productId: "p1", thresholdType: "quantity" })
      ).rejects.toThrow();
    });

    test("rejects days type without minDays", async () => {
      await expect(
        api.createThreshold({ productId: "p1", thresholdType: "days" })
      ).rejects.toThrow();
    });
  });

  describe("updateThreshold", () => {
    test("sends PUT request with validated data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "t1", productId: "p1", minQuantity: 20 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.updateThreshold("t1", { minQuantity: 20 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/thresholds/t1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ minQuantity: 20 }),
        })
      );
    });

    test("updates threshold type to days", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "t1", productId: "p1", thresholdType: "days", minDays: 14 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.updateThreshold("t1", { thresholdType: "days", minDays: 14 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/thresholds/t1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ thresholdType: "days", minDays: 14 }),
        })
      );
    });

    test("rejects invalid threshold ID", async () => {
      const longId = "a".repeat(101);
      await expect(
        api.updateThreshold(longId, { minQuantity: 10 })
      ).rejects.toThrow("Invalid threshold ID");
    });

    test("rejects empty threshold ID", async () => {
      await expect(
        api.updateThreshold("", { minQuantity: 10 })
      ).rejects.toThrow("Invalid threshold ID");
    });
  });

  describe("deleteThreshold", () => {
    test("sends DELETE request", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.deleteThreshold("t1");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/thresholds/t1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("getSettings", () => {
    test("fetches settings", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ emailNotifications: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getSettings();

      expect(mockFetch).toHaveBeenCalledWith("/api/settings", expect.any(Object));
    });
  });

  describe("getLimits", () => {
    test("fetches limit info from /settings/limits", async () => {
      const mockLimitInfo = {
        plan: "FREE" as const,
        thresholds: {
          current: 10,
          max: 50,
          remaining: 40,
          isOverLimit: false,
        },
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockLimitInfo), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const result = await api.getLimits();

      expect(mockFetch).toHaveBeenCalledWith("/api/settings/limits", expect.any(Object));
      expect(result).toEqual(mockLimitInfo);
    });
  });

  describe("updateSettings", () => {
    test("sends PUT request with validated settings", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ emailNotifications: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.updateSettings({ emailNotifications: false });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ emailNotifications: false }),
        })
      );
    });

    test("validates sync frequency", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ syncFrequency: "daily" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.updateSettings({ syncFrequency: "daily" });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("login", () => {
    test("sends POST request with credentials", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "u1", email: "test@test.com", name: "Test", role: "admin" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );

      const result = await api.login({ email: "test@test.com", password: "password123" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "test@test.com", password: "password123" }),
        })
      );
      expect(result.user.email).toBe("test@test.com");
    });

    test("validates email format", async () => {
      await expect(
        api.login({ email: "invalid-email", password: "password123" })
      ).rejects.toThrow();
    });

    test("validates password presence", async () => {
      await expect(
        api.login({ email: "test@test.com", password: "" })
      ).rejects.toThrow();
    });
  });

  describe("logout", () => {
    test("sends POST request to logout", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("getCurrentUser", () => {
    test("returns user when authenticated", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "u1", email: "test@test.com", name: "Test", subscriptionStatus: "none" },
              currentTenant: { id: "t1", name: "Test Tenant", bsaleClientCode: "ABC123", syncStatus: "success" },
              tenants: [{ id: "t1", name: "Test Tenant", bsaleClientCode: "ABC123", role: "owner", syncStatus: "success" }],
              role: "owner",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );

      const response = await api.getCurrentUser();

      expect(response).not.toBeNull();
      expect(response?.user.email).toBe("test@test.com");
    });

    test("returns null when not authenticated", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Not authenticated" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const user = await api.getCurrentUser();

      expect(user).toBeNull();
    });

    test("returns null on network error", async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

      const user = await api.getCurrentUser();

      expect(user).toBeNull();
    });
  });

  describe("error handling", () => {
    test("throws ApiError on non-ok response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await expect(api.getProducts()).rejects.toThrow(ApiError);
    });

    test("includes error message from response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Custom error message" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      try {
        await api.getProducts();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe("Custom error message");
        expect((error as ApiError).status).toBe(400);
      }
    });

    test("uses fallback message when no error in response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("{}", {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      try {
        await api.getProducts();
        expect(true).toBe(false);
      } catch (error) {
        expect((error as ApiError).message).toBe("HTTP error 500");
      }
    });

    test("handles non-JSON error response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("Internal Server Error", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          })
        )
      );

      try {
        await api.getProducts();
        expect(true).toBe(false);
      } catch (error) {
        expect((error as ApiError).message).toBe("HTTP error 500");
      }
    });
  });

  describe("request configuration", () => {
    test("includes credentials in requests", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getProducts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: "include" })
      );
    });

    test("sets Content-Type header", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await api.getProducts();

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("createCheckoutSession", () => {
    test("sends POST request to checkout endpoint", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ url: "https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=abc123" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const result = await api.createCheckoutSession();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/billing/checkout",
        expect.objectContaining({ method: "POST" })
      );
      expect(result.url).toBe("https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=abc123");
    });

    test("throws ApiError on failure", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Already subscribed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await expect(api.createCheckoutSession()).rejects.toThrow(ApiError);
    });

    test("throws ApiError when unauthorized", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      try {
        await api.createCheckoutSession();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
      }
    });
  });

  describe("cancelSubscription", () => {
    test("sends POST request to cancel endpoint", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: "Subscription cancelled", endsAt: "2025-02-01T00:00:00.000Z" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        )
      );

      const result = await api.cancelSubscription();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/billing/cancel",
        expect.objectContaining({ method: "POST" })
      );
      expect(result.message).toBe("Subscription cancelled");
      expect(result.endsAt).toBe("2025-02-01T00:00:00.000Z");
    });

    test("throws ApiError when no subscription", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "No active subscription" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      try {
        await api.cancelSubscription();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe("No active subscription");
      }
    });

    test("throws ApiError when unauthorized", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await expect(api.cancelSubscription()).rejects.toThrow(ApiError);
    });
  });

  describe("triggerSync", () => {
    test("sends POST request to sync trigger endpoint", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              productsUpdated: 50,
              alertsGenerated: 5,
              duration: 1234,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );

      const result = await api.triggerSync();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/sync/trigger",
        expect.objectContaining({ method: "POST" })
      );
      expect(result.success).toBe(true);
      expect(result.productsUpdated).toBe(50);
      expect(result.alertsGenerated).toBe(5);
      expect(result.duration).toBe(1234);
    });

    test("returns error details on sync failure", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              productsUpdated: 0,
              alertsGenerated: 0,
              duration: 500,
              error: "Bsale API unavailable",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );

      const result = await api.triggerSync();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Bsale API unavailable");
    });

    test("throws ApiError when unauthorized", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      try {
        await api.triggerSync();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
      }
    });

    test("throws ApiError on server error", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await expect(api.triggerSync()).rejects.toThrow(ApiError);
    });
  });
});
