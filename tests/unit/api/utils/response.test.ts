import { test, expect, describe } from "bun:test";
import { withRefreshedCookies } from "@/api/utils/response";
import type { SessionRefresh } from "@/api/middleware/auth";
import { SESSION_TTL_SECONDS } from "@/utils/cookies";

describe("withRefreshedCookies", () => {
  const mockRefresh: SessionRefresh = {
    sessionToken: "test-session-token",
    csrfToken: "test-csrf-token",
    expiresAt: new Date("2026-01-25"),
  };

  test("returns original response when refresh is undefined", () => {
    const originalResponse = new Response("test body", { status: 200 });

    const result = withRefreshedCookies(originalResponse, undefined);

    expect(result).toBe(originalResponse);
  });

  test("adds Set-Cookie headers when refresh is provided", () => {
    const originalResponse = new Response("test body", { status: 200 });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    expect(result).not.toBe(originalResponse);

    const cookies = result.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThanOrEqual(1);
  });

  test("preserves original response status", () => {
    const originalResponse = new Response("test body", { status: 201 });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    expect(result.status).toBe(201);
  });

  test("preserves original response status text", () => {
    const originalResponse = new Response("test body", {
      status: 201,
      statusText: "Created",
    });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    expect(result.statusText).toBe("Created");
  });

  test("preserves original response body", async () => {
    const originalResponse = new Response("test body content", { status: 200 });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    const body = await result.text();
    expect(body).toBe("test body content");
  });

  test("preserves original response headers", () => {
    const originalResponse = new Response("test body", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Custom-Header": "custom-value",
      },
    });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    expect(result.headers.get("Content-Type")).toBe("application/json");
    expect(result.headers.get("X-Custom-Header")).toBe("custom-value");
  });

  test("adds session cookie with correct token", () => {
    const originalResponse = new Response("test body", { status: 200 });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    const cookies = result.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.includes("session_token="));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("session_token=test-session-token");
  });

  test("adds CSRF cookie with correct token", () => {
    const originalResponse = new Response("test body", { status: 200 });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    const cookies = result.headers.getSetCookie();
    const csrfCookie = cookies.find((c) => c.includes("csrf_token="));

    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toContain("csrf_token=test-csrf-token");
  });

  test("adds correct Max-Age to cookies", () => {
    const originalResponse = new Response("test body", { status: 200 });

    const result = withRefreshedCookies(originalResponse, mockRefresh, false);

    const cookies = result.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.includes("session_token="));

    expect(sessionCookie).toContain(`Max-Age=${String(SESSION_TTL_SECONDS)}`);
  });

  describe("production mode", () => {
    test("adds Secure flag to cookies in production", () => {
      const originalResponse = new Response("test body", { status: 200 });

      const result = withRefreshedCookies(originalResponse, mockRefresh, true);

      const cookies = result.headers.getSetCookie();
      for (const cookie of cookies) {
        expect(cookie).toContain("Secure");
      }
    });
  });

  describe("development mode", () => {
    test("does not add Secure flag to cookies in development", () => {
      const originalResponse = new Response("test body", { status: 200 });

      const result = withRefreshedCookies(originalResponse, mockRefresh, false);

      const cookies = result.headers.getSetCookie();
      for (const cookie of cookies) {
        expect(cookie).not.toContain("Secure");
      }
    });
  });

  test("does not add CSRF cookie when csrfToken is empty", () => {
    const refreshNoCsrf: SessionRefresh = {
      sessionToken: "test-session-token",
      csrfToken: "",
      expiresAt: new Date("2026-01-25"),
    };

    const originalResponse = new Response("test body", { status: 200 });
    const result = withRefreshedCookies(originalResponse, refreshNoCsrf, false);

    const cookies = result.headers.getSetCookie();
    const csrfCookie = cookies.find((c) => c.includes("csrf_token="));

    expect(csrfCookie).toBeUndefined();
  });
});
