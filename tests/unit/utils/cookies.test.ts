import { test, expect, describe } from "bun:test";
import {
  extractSessionToken,
  createRefreshCookies,
  SESSION_TTL_DAYS,
  SESSION_TTL_SECONDS,
  SESSION_REFRESH_THRESHOLD_DAYS,
} from "@/utils/cookies";
import type { SessionRefresh } from "@/api/middleware/auth";

describe("extractSessionToken", () => {
  test("extracts session token from single cookie", () => {
    const token = extractSessionToken("session_token=abc123");
    expect(token).toBe("abc123");
  });

  test("extracts session token from multiple cookies", () => {
    const token = extractSessionToken(
      "other=value; session_token=xyz789; another=cookie"
    );
    expect(token).toBe("xyz789");
  });

  test("handles cookies with whitespace", () => {
    const token = extractSessionToken(
      "  session_token=token123  ;  other=value  "
    );
    expect(token).toBe("token123");
  });

  test("returns null when session_token is not present", () => {
    const token = extractSessionToken("other=value; another=cookie");
    expect(token).toBeNull();
  });

  test("returns null for empty cookie header", () => {
    const token = extractSessionToken("");
    expect(token).toBeNull();
  });

  test("handles cookie with empty value", () => {
    const token = extractSessionToken("session_token=");
    // Empty string is returned, which is a valid value
    expect(token).toBe("");
  });

  test("handles complex token values", () => {
    const complexToken = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWJjIn0.signature";
    const token = extractSessionToken(`session_token=${complexToken}`);
    expect(token).toBe(complexToken);
  });
});

describe("constants", () => {
  test("SESSION_TTL_DAYS is 7", () => {
    expect(SESSION_TTL_DAYS).toBe(7);
  });

  test("SESSION_TTL_SECONDS is 7 days in seconds", () => {
    expect(SESSION_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  test("SESSION_REFRESH_THRESHOLD_DAYS is 3.5", () => {
    expect(SESSION_REFRESH_THRESHOLD_DAYS).toBe(3.5);
  });
});

describe("createRefreshCookies", () => {
  const mockRefresh: SessionRefresh = {
    sessionToken: "test-session-token",
    csrfToken: "test-csrf-token",
    expiresAt: new Date("2026-01-25"),
  };

  describe("production mode", () => {
    test("creates session cookie with HttpOnly, Secure, SameSite=Strict", () => {
      const cookies = createRefreshCookies(mockRefresh, true);
      const sessionCookie = cookies[0];

      expect(sessionCookie).toContain("session_token=test-session-token");
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("Secure");
      expect(sessionCookie).toContain("SameSite=Strict");
      expect(sessionCookie).toContain(`Max-Age=${String(SESSION_TTL_SECONDS)}`);
      expect(sessionCookie).toContain("Path=/");
    });

    test("creates CSRF cookie with Secure, SameSite=Strict (no HttpOnly)", () => {
      const cookies = createRefreshCookies(mockRefresh, true);
      const csrfCookie = cookies[1];

      expect(csrfCookie).toContain("csrf_token=test-csrf-token");
      expect(csrfCookie).toContain("Secure");
      expect(csrfCookie).toContain("SameSite=Strict");
      expect(csrfCookie).toContain(`Max-Age=${String(SESSION_TTL_SECONDS)}`);
      expect(csrfCookie).toContain("Path=/");
      expect(csrfCookie).not.toContain("HttpOnly");
    });
  });

  describe("development mode", () => {
    test("creates session cookie with HttpOnly, SameSite=Lax (no Secure)", () => {
      const cookies = createRefreshCookies(mockRefresh, false);
      const sessionCookie = cookies[0];

      expect(sessionCookie).toContain("session_token=test-session-token");
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("SameSite=Lax");
      expect(sessionCookie).not.toContain("Secure");
    });

    test("creates CSRF cookie without Secure flag", () => {
      const cookies = createRefreshCookies(mockRefresh, false);
      const csrfCookie = cookies[1];

      expect(csrfCookie).toContain("csrf_token=test-csrf-token");
      expect(csrfCookie).not.toContain("Secure");
    });
  });

  test("returns only session cookie when CSRF token is empty", () => {
    const refreshNoCsrf: SessionRefresh = {
      sessionToken: "test-session-token",
      csrfToken: "",
      expiresAt: new Date("2026-01-25"),
    };

    const cookies = createRefreshCookies(refreshNoCsrf, false);

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("session_token=test-session-token");
  });

  test("returns both cookies when CSRF token is present", () => {
    const cookies = createRefreshCookies(mockRefresh, false);

    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("session_token");
    expect(cookies[1]).toContain("csrf_token");
  });
});
