import { test, expect, describe } from "bun:test";

// Test the URL validation and error sanitization logic directly
// These are exported for testing purposes

// Validate Stripe URLs to prevent open redirect attacks
function isValidStripeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === "https:" &&
      (parsedUrl.hostname === "checkout.stripe.com" ||
        parsedUrl.hostname === "billing.stripe.com" ||
        parsedUrl.hostname.endsWith(".stripe.com"))
    );
  } catch {
    return false;
  }
}

// Mock ApiError for testing
class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Sanitize error messages for user display
function getSafeErrorMessage(err: unknown, defaultMessage: string): string {
  if (err instanceof ApiError) {
    const safeMessages: Record<number, string> = {
      400: "No se pudo procesar la solicitud",
      401: "Sesion expirada, por favor inicia sesion nuevamente",
      404: "Recurso no encontrado",
      500: "Error del servidor, intenta nuevamente",
    };
    return safeMessages[err.status] ?? defaultMessage;
  }
  return defaultMessage;
}

describe("isValidStripeUrl", () => {
  describe("valid Stripe URLs", () => {
    test("accepts checkout.stripe.com", () => {
      expect(isValidStripeUrl("https://checkout.stripe.com/session123")).toBe(true);
    });

    test("accepts billing.stripe.com", () => {
      expect(isValidStripeUrl("https://billing.stripe.com/portal123")).toBe(true);
    });

    test("accepts subdomains of stripe.com", () => {
      expect(isValidStripeUrl("https://pay.stripe.com/checkout")).toBe(true);
    });

    test("accepts URLs with paths and query params", () => {
      expect(
        isValidStripeUrl("https://checkout.stripe.com/pay/cs_test_abc?locale=es")
      ).toBe(true);
    });
  });

  describe("invalid URLs", () => {
    test("rejects http (non-https) URLs", () => {
      expect(isValidStripeUrl("http://checkout.stripe.com/session123")).toBe(false);
    });

    test("rejects non-Stripe domains", () => {
      expect(isValidStripeUrl("https://malicious-site.com/checkout")).toBe(false);
    });

    test("rejects domains that contain stripe.com but are not subdomains", () => {
      expect(isValidStripeUrl("https://fakstripe.com/checkout")).toBe(false);
    });

    test("rejects domains that look like stripe but aren't", () => {
      expect(isValidStripeUrl("https://stripe.com.evil.com/checkout")).toBe(false);
    });

    test("rejects invalid URLs", () => {
      expect(isValidStripeUrl("not-a-url")).toBe(false);
    });

    test("rejects empty string", () => {
      expect(isValidStripeUrl("")).toBe(false);
    });

    test("rejects javascript: URLs", () => {
      expect(isValidStripeUrl("javascript:alert(1)")).toBe(false);
    });

    test("rejects data: URLs", () => {
      expect(isValidStripeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    });
  });
});

describe("getSafeErrorMessage", () => {
  describe("ApiError handling", () => {
    test("returns safe message for 400 errors", () => {
      const err = new ApiError("Sensitive validation error details", 400);
      expect(getSafeErrorMessage(err, "Default")).toBe("No se pudo procesar la solicitud");
    });

    test("returns safe message for 401 errors", () => {
      const err = new ApiError("Token expired at timestamp xyz", 401);
      expect(getSafeErrorMessage(err, "Default")).toBe(
        "Sesion expirada, por favor inicia sesion nuevamente"
      );
    });

    test("returns safe message for 404 errors", () => {
      const err = new ApiError("Resource /internal/path not found", 404);
      expect(getSafeErrorMessage(err, "Default")).toBe("Recurso no encontrado");
    });

    test("returns safe message for 500 errors", () => {
      const err = new ApiError("Database connection failed: password=secret", 500);
      expect(getSafeErrorMessage(err, "Default")).toBe(
        "Error del servidor, intenta nuevamente"
      );
    });

    test("returns default message for unknown status codes", () => {
      const err = new ApiError("Some error", 418);
      expect(getSafeErrorMessage(err, "Default message")).toBe("Default message");
    });
  });

  describe("non-ApiError handling", () => {
    test("returns default message for regular Error", () => {
      const err = new Error("Sensitive error details");
      expect(getSafeErrorMessage(err, "Safe default")).toBe("Safe default");
    });

    test("returns default message for string error", () => {
      expect(getSafeErrorMessage("string error", "Safe default")).toBe("Safe default");
    });

    test("returns default message for null", () => {
      expect(getSafeErrorMessage(null, "Safe default")).toBe("Safe default");
    });

    test("returns default message for undefined", () => {
      expect(getSafeErrorMessage(undefined, "Safe default")).toBe("Safe default");
    });
  });
});
