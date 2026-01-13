import { describe, test, expect, beforeEach } from "bun:test";
import {
  generateCSRFToken,
  validateCSRFToken,
  extractCSRFTokenFromCookie,
  createCSRFCookie,
  createCSRFService,
} from "@/utils/csrf";

describe("CSRF Utility", () => {
  const validSecret = "a".repeat(32); // Minimum 32 characters

  describe("generateCSRFToken", () => {
    test("generates token in correct format", () => {
      const token = generateCSRFToken(validSecret);

      expect(token).toContain(".");
      const parts = token.split(".");
      expect(parts).toHaveLength(3); // timestamp.randomData.signature
    });

    test("generates unique tokens", () => {
      const token1 = generateCSRFToken(validSecret);
      const token2 = generateCSRFToken(validSecret);

      expect(token1).not.toBe(token2);
    });

    test("throws error for short secret", () => {
      expect(() => generateCSRFToken("short")).toThrow(
        "CSRF secret must be at least 32 characters"
      );
    });

    test("throws error for empty secret", () => {
      expect(() => generateCSRFToken("")).toThrow(
        "CSRF secret must be at least 32 characters"
      );
    });
  });

  describe("validateCSRFToken", () => {
    test("validates correct token", () => {
      const token = generateCSRFToken(validSecret);

      expect(validateCSRFToken(token, validSecret)).toBe(true);
    });

    test("rejects token with wrong secret", () => {
      const token = generateCSRFToken(validSecret);
      const wrongSecret = "b".repeat(32);

      expect(validateCSRFToken(token, wrongSecret)).toBe(false);
    });

    test("rejects empty token", () => {
      expect(validateCSRFToken("", validSecret)).toBe(false);
    });

    test("rejects empty secret", () => {
      const token = generateCSRFToken(validSecret);
      expect(validateCSRFToken(token, "")).toBe(false);
    });

    test("rejects token with wrong number of parts", () => {
      expect(validateCSRFToken("only.two", validSecret)).toBe(false);
      expect(validateCSRFToken("too.many.parts.here", validSecret)).toBe(false);
    });

    test("rejects token with tampered signature", () => {
      const token = generateCSRFToken(validSecret);
      const parts = token.split(".");
      parts[2] = "tampered-signature";
      const tamperedToken = parts.join(".");

      expect(validateCSRFToken(tamperedToken, validSecret)).toBe(false);
    });

    test("rejects token with tampered timestamp", () => {
      const token = generateCSRFToken(validSecret);
      const parts = token.split(".");
      parts[0] = "invalid";
      const tamperedToken = parts.join(".");

      expect(validateCSRFToken(tamperedToken, validSecret)).toBe(false);
    });

    test("rejects expired token", async () => {
      const token = generateCSRFToken(validSecret);

      // Wait a bit and validate with 1ms TTL - should be expired
      await Bun.sleep(10);
      expect(validateCSRFToken(token, validSecret, 1)).toBe(false);
    });

    test("accepts token within TTL", () => {
      const token = generateCSRFToken(validSecret);

      // Validate with long TTL
      expect(validateCSRFToken(token, validSecret, 60 * 60 * 1000)).toBe(true);
    });

    test("rejects token with missing parts", () => {
      expect(validateCSRFToken("a..", validSecret)).toBe(false);
      expect(validateCSRFToken(".b.", validSecret)).toBe(false);
      expect(validateCSRFToken("..c", validSecret)).toBe(false);
    });
  });

  describe("extractCSRFTokenFromCookie", () => {
    test("extracts token from cookie header", () => {
      const cookieHeader = "csrf_token=abc123; session_token=xyz789";
      const token = extractCSRFTokenFromCookie(cookieHeader);

      expect(token).toBe("abc123");
    });

    test("extracts token with custom cookie name", () => {
      const cookieHeader = "my_csrf=abc123; session_token=xyz789";
      const token = extractCSRFTokenFromCookie(cookieHeader, "my_csrf");

      expect(token).toBe("abc123");
    });

    test("returns null for missing cookie", () => {
      const cookieHeader = "session_token=xyz789";
      const token = extractCSRFTokenFromCookie(cookieHeader);

      expect(token).toBeNull();
    });

    test("returns null for null header", () => {
      const token = extractCSRFTokenFromCookie(null);

      expect(token).toBeNull();
    });

    test("handles cookie with equals sign in value", () => {
      const cookieHeader = "csrf_token=abc=123=xyz; session_token=xyz789";
      const token = extractCSRFTokenFromCookie(cookieHeader);

      expect(token).toBe("abc=123=xyz");
    });

    test("handles empty cookie value", () => {
      const cookieHeader = "csrf_token=; session_token=xyz789";
      const token = extractCSRFTokenFromCookie(cookieHeader);

      expect(token).toBeNull();
    });

    test("handles cookie at start of header", () => {
      const cookieHeader = "csrf_token=first";
      const token = extractCSRFTokenFromCookie(cookieHeader);

      expect(token).toBe("first");
    });

    test("handles cookie at end of header", () => {
      const cookieHeader = "other=value; csrf_token=last";
      const token = extractCSRFTokenFromCookie(cookieHeader);

      expect(token).toBe("last");
    });
  });

  describe("createCSRFCookie", () => {
    test("creates cookie with default options", () => {
      const token = "test-token-123";
      const cookie = createCSRFCookie(token);

      expect(cookie).toContain("csrf_token=test-token-123");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Max-Age=");
    });

    test("creates cookie with custom name", () => {
      const token = "test-token-123";
      const cookie = createCSRFCookie(token, { cookieName: "my_csrf" });

      expect(cookie).toContain("my_csrf=test-token-123");
    });

    test("creates cookie with custom max age", () => {
      const token = "test-token-123";
      const cookie = createCSRFCookie(token, { maxAge: 3600 });

      expect(cookie).toContain("Max-Age=3600");
    });

    test("creates cookie with custom path", () => {
      const token = "test-token-123";
      const cookie = createCSRFCookie(token, { path: "/api" });

      expect(cookie).toContain("Path=/api");
    });

    test("adds Secure flag when specified", () => {
      const token = "test-token-123";
      const cookie = createCSRFCookie(token, { secure: true });

      expect(cookie).toContain("Secure");
    });

    test("omits Secure flag when false", () => {
      const token = "test-token-123";
      const cookie = createCSRFCookie(token, { secure: false });

      expect(cookie).not.toContain("Secure");
    });

    test("does not include HttpOnly (CSRF cookie must be readable by JS)", () => {
      const token = "test-token-123";
      const cookie = createCSRFCookie(token);

      expect(cookie).not.toContain("HttpOnly");
    });
  });

  describe("createCSRFService", () => {
    let service: ReturnType<typeof createCSRFService>;

    beforeEach(() => {
      service = createCSRFService({ secret: validSecret });
    });

    test("generates and validates tokens", () => {
      const token = service.generateToken();

      expect(service.validateToken(token)).toBe(true);
    });

    test("creates cookie for token", () => {
      const token = service.generateToken();
      const cookie = service.createCookie(token);

      expect(cookie).toContain(token);
    });

    test("extracts token from cookie header", () => {
      const token = "test-token";
      const cookieHeader = `csrf_token=${token}`;

      expect(service.extractFromCookie(cookieHeader)).toBe(token);
    });

    test("extracts token from request header", () => {
      const token = "test-token";
      const request = new Request("http://localhost", {
        headers: { "X-CSRF-Token": token },
      });

      expect(service.extractFromHeader(request)).toBe(token);
    });

    test("returns default header name", () => {
      expect(service.getHeaderName()).toBe("X-CSRF-Token");
    });

    test("returns default cookie name", () => {
      expect(service.getCookieName()).toBe("csrf_token");
    });

    test("validates request with matching cookie and header tokens", () => {
      const token = service.generateToken();
      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          Cookie: `csrf_token=${token}`,
          "X-CSRF-Token": token,
        },
      });

      expect(service.validateRequest(request)).toBe(true);
    });

    test("rejects request with missing cookie token", () => {
      const token = service.generateToken();
      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          "X-CSRF-Token": token,
        },
      });

      expect(service.validateRequest(request)).toBe(false);
    });

    test("rejects request with missing header token", () => {
      const token = service.generateToken();
      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          Cookie: `csrf_token=${token}`,
        },
      });

      expect(service.validateRequest(request)).toBe(false);
    });

    test("rejects request with mismatched tokens", () => {
      const cookieToken = service.generateToken();
      const headerToken = service.generateToken();
      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          Cookie: `csrf_token=${cookieToken}`,
          "X-CSRF-Token": headerToken,
        },
      });

      expect(service.validateRequest(request)).toBe(false);
    });

    test("rejects request with invalid token", () => {
      const invalidToken = "invalid.token.here";
      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          Cookie: `csrf_token=${invalidToken}`,
          "X-CSRF-Token": invalidToken,
        },
      });

      expect(service.validateRequest(request)).toBe(false);
    });

    describe("custom configuration", () => {
      test("uses custom token TTL", async () => {
        const shortTtlService = createCSRFService({
          secret: validSecret,
          tokenTtlMs: 1,
        });
        const token = shortTtlService.generateToken();

        // Wait for token to expire
        await Bun.sleep(10);
        expect(shortTtlService.validateToken(token)).toBe(false);
      });

      test("uses custom cookie name", () => {
        const customService = createCSRFService({
          secret: validSecret,
          cookieName: "my_csrf",
        });

        expect(customService.getCookieName()).toBe("my_csrf");

        const token = customService.generateToken();
        const cookieHeader = `my_csrf=${token}`;
        expect(customService.extractFromCookie(cookieHeader)).toBe(token);
      });

      test("uses custom header name", () => {
        const customService = createCSRFService({
          secret: validSecret,
          headerName: "X-Custom-CSRF",
        });

        expect(customService.getHeaderName()).toBe("X-Custom-CSRF");

        const token = "test-token";
        const request = new Request("http://localhost", {
          headers: { "X-Custom-CSRF": token },
        });
        expect(customService.extractFromHeader(request)).toBe(token);
      });
    });
  });
});
