import { test, expect, describe } from "bun:test";

// Test the URL validation and error sanitization logic directly
// These are exported for testing purposes

// Validate MercadoPago URLs to prevent open redirect attacks
function isValidMercadoPagoUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === "https:" &&
      (parsedUrl.hostname === "www.mercadopago.com" ||
        parsedUrl.hostname === "www.mercadopago.cl" ||
        parsedUrl.hostname === "www.mercadopago.com.ar" ||
        parsedUrl.hostname === "www.mercadopago.com.br" ||
        parsedUrl.hostname === "www.mercadopago.com.mx" ||
        parsedUrl.hostname.endsWith(".mercadopago.com") ||
        parsedUrl.hostname.endsWith(".mercadopago.cl"))
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

describe("isValidMercadoPagoUrl", () => {
  describe("valid MercadoPago URLs", () => {
    test("accepts www.mercadopago.com", () => {
      expect(isValidMercadoPagoUrl("https://www.mercadopago.com/checkout/v1/redirect")).toBe(true);
    });

    test("accepts www.mercadopago.cl (Chile)", () => {
      expect(isValidMercadoPagoUrl("https://www.mercadopago.cl/subscriptions/checkout")).toBe(true);
    });

    test("accepts www.mercadopago.com.ar (Argentina)", () => {
      expect(isValidMercadoPagoUrl("https://www.mercadopago.com.ar/checkout")).toBe(true);
    });

    test("accepts subdomains of mercadopago.com", () => {
      expect(isValidMercadoPagoUrl("https://api.mercadopago.com/checkout")).toBe(true);
    });

    test("accepts URLs with paths and query params", () => {
      expect(
        isValidMercadoPagoUrl("https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=abc123")
      ).toBe(true);
    });
  });

  describe("invalid URLs", () => {
    test("rejects http (non-https) URLs", () => {
      expect(isValidMercadoPagoUrl("http://www.mercadopago.com/checkout")).toBe(false);
    });

    test("rejects non-MercadoPago domains", () => {
      expect(isValidMercadoPagoUrl("https://malicious-site.com/checkout")).toBe(false);
    });

    test("rejects domains that contain mercadopago but are not subdomains", () => {
      expect(isValidMercadoPagoUrl("https://fakmercadopago.com/checkout")).toBe(false);
    });

    test("rejects domains that look like mercadopago but aren't", () => {
      expect(isValidMercadoPagoUrl("https://mercadopago.com.evil.com/checkout")).toBe(false);
    });

    test("rejects invalid URLs", () => {
      expect(isValidMercadoPagoUrl("not-a-url")).toBe(false);
    });

    test("rejects empty string", () => {
      expect(isValidMercadoPagoUrl("")).toBe(false);
    });

    test("rejects javascript: URLs", () => {
      expect(isValidMercadoPagoUrl("javascript:alert(1)")).toBe(false);
    });

    test("rejects data: URLs", () => {
      expect(isValidMercadoPagoUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
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
