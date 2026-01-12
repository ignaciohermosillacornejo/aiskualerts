 
import { test, expect, describe } from "bun:test";
import {
  BsaleAuthError,
  BsaleRateLimitError,
  BsaleServerError,
  ResendAuthError,
  ResendRateLimitError,
  ResendValidationError,
  ResendServerError,
} from "../../../src/lib/errors";

describe("Error Classes", () => {
  describe("BsaleAuthError", () => {
    test("creates error with correct name and message", () => {
      const error = new BsaleAuthError("Authentication failed");
      expect(error.name).toBe("BsaleAuthError");
      expect(error.message).toBe("Authentication failed");
    });

    test("is instance of Error", () => {
      const error = new BsaleAuthError("Test");
      expect(error).toBeInstanceOf(Error);
    });

    test("can be thrown and caught", () => {
      expect(() => {
        throw new BsaleAuthError("Auth error");
      }).toThrow(BsaleAuthError);
    });
  });

  describe("BsaleRateLimitError", () => {
    test("creates error with correct name and message", () => {
      const error = new BsaleRateLimitError("Rate limit exceeded");
      expect(error.name).toBe("BsaleRateLimitError");
      expect(error.message).toBe("Rate limit exceeded");
    });

    test("is instance of Error", () => {
      const error = new BsaleRateLimitError("Test");
      expect(error).toBeInstanceOf(Error);
    });

    test("can be thrown and caught", () => {
      expect(() => {
        throw new BsaleRateLimitError("Rate limit");
      }).toThrow(BsaleRateLimitError);
    });
  });

  describe("BsaleServerError", () => {
    test("creates error with correct name, message, and status code", () => {
      const error = new BsaleServerError("Server error", 502);
      expect(error.name).toBe("BsaleServerError");
      expect(error.message).toBe("Server error");
      expect(error.statusCode).toBe(502);
    });

    test("is instance of Error", () => {
      const error = new BsaleServerError("Test", 500);
      expect(error).toBeInstanceOf(Error);
    });

    test("stores different status codes", () => {
      const error500 = new BsaleServerError("Internal error", 500);
      const error503 = new BsaleServerError("Service unavailable", 503);

      expect(error500.statusCode).toBe(500);
      expect(error503.statusCode).toBe(503);
    });

    test("can be thrown and caught", () => {
      expect(() => {
        throw new BsaleServerError("Server error", 500);
      }).toThrow(BsaleServerError);
    });
  });

  describe("ResendAuthError", () => {
    test("creates error with correct name and message", () => {
      const error = new ResendAuthError("Invalid API key");
      expect(error.name).toBe("ResendAuthError");
      expect(error.message).toBe("Invalid API key");
    });

    test("is instance of Error", () => {
      const error = new ResendAuthError("Test");
      expect(error).toBeInstanceOf(Error);
    });

    test("can be thrown and caught", () => {
      expect(() => {
        throw new ResendAuthError("Auth error");
      }).toThrow(ResendAuthError);
    });
  });

  describe("ResendRateLimitError", () => {
    test("creates error with correct name and message", () => {
      const error = new ResendRateLimitError("Too many requests");
      expect(error.name).toBe("ResendRateLimitError");
      expect(error.message).toBe("Too many requests");
    });

    test("is instance of Error", () => {
      const error = new ResendRateLimitError("Test");
      expect(error).toBeInstanceOf(Error);
    });

    test("can be thrown and caught", () => {
      expect(() => {
        throw new ResendRateLimitError("Rate limited");
      }).toThrow(ResendRateLimitError);
    });
  });

  describe("ResendValidationError", () => {
    test("creates error with correct name and message", () => {
      const error = new ResendValidationError("Invalid email format");
      expect(error.name).toBe("ResendValidationError");
      expect(error.message).toBe("Invalid email format");
    });

    test("is instance of Error", () => {
      const error = new ResendValidationError("Test");
      expect(error).toBeInstanceOf(Error);
    });

    test("can be thrown and caught", () => {
      expect(() => {
        throw new ResendValidationError("Validation error");
      }).toThrow(ResendValidationError);
    });
  });

  describe("ResendServerError", () => {
    test("creates error with correct name, message, and status code", () => {
      const error = new ResendServerError("Resend server error", 503);
      expect(error.name).toBe("ResendServerError");
      expect(error.message).toBe("Resend server error");
      expect(error.statusCode).toBe(503);
    });

    test("is instance of Error", () => {
      const error = new ResendServerError("Test", 500);
      expect(error).toBeInstanceOf(Error);
    });

    test("stores different status codes", () => {
      const error500 = new ResendServerError("Internal error", 500);
      const error502 = new ResendServerError("Bad gateway", 502);

      expect(error500.statusCode).toBe(500);
      expect(error502.statusCode).toBe(502);
    });

    test("can be thrown and caught", () => {
      expect(() => {
        throw new ResendServerError("Server error", 500);
      }).toThrow(ResendServerError);
    });
  });

  describe("Error type checking", () => {
    test("can distinguish between Bsale error types", () => {
      const authError = new BsaleAuthError("Auth");
      const rateLimitError = new BsaleRateLimitError("Rate");
      const serverError = new BsaleServerError("Server", 500);

      expect(authError).toBeInstanceOf(BsaleAuthError);
      expect(authError).not.toBeInstanceOf(BsaleRateLimitError);
      expect(authError).not.toBeInstanceOf(BsaleServerError);

      expect(rateLimitError).toBeInstanceOf(BsaleRateLimitError);
      expect(rateLimitError).not.toBeInstanceOf(BsaleAuthError);

      expect(serverError).toBeInstanceOf(BsaleServerError);
      expect(serverError).not.toBeInstanceOf(BsaleAuthError);
    });

    test("can distinguish between Resend error types", () => {
      const authError = new ResendAuthError("Auth");
      const rateLimitError = new ResendRateLimitError("Rate");
      const validationError = new ResendValidationError("Validation");
      const serverError = new ResendServerError("Server", 500);

      expect(authError).toBeInstanceOf(ResendAuthError);
      expect(authError).not.toBeInstanceOf(ResendRateLimitError);

      expect(rateLimitError).toBeInstanceOf(ResendRateLimitError);
      expect(rateLimitError).not.toBeInstanceOf(ResendValidationError);

      expect(validationError).toBeInstanceOf(ResendValidationError);
      expect(validationError).not.toBeInstanceOf(ResendServerError);

      expect(serverError).toBeInstanceOf(ResendServerError);
      expect(serverError).not.toBeInstanceOf(ResendValidationError);
    });
  });
});
