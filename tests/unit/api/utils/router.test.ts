/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, beforeEach, mock } from "bun:test";
import { createAuthedRoute } from "@/api/utils/router";
import type { AuthMiddleware, AuthContext, SessionRefresh } from "@/api/middleware/auth";
import { AuthenticationError } from "@/api/middleware/auth";

describe("createAuthedRoute", () => {
  let mockAuthMiddleware: AuthMiddleware;
  let mockAuthenticate: ReturnType<typeof mock>;

  beforeEach(() => {
    mockAuthenticate = mock(() =>
      Promise.resolve({
        userId: "user-123",
        tenantId: "tenant-456",
      } as AuthContext)
    );

    mockAuthMiddleware = {
      authenticate: mockAuthenticate,
    };
  });

  test("calls authenticate with the request", async () => {
    const authedRoute = createAuthedRoute(mockAuthMiddleware);
    const handler = authedRoute(async () => new Response("success"));

    const request = new Request("http://localhost/api/test", {
      headers: {
        Cookie: "session_token=valid-token",
      },
    });

    await handler(request);

    expect(mockAuthenticate).toHaveBeenCalledWith(request);
  });

  test("passes auth context to handler", async () => {
    const authedRoute = createAuthedRoute(mockAuthMiddleware);

    let receivedUserId = "";
    let receivedTenantId = "";
    const handler = authedRoute(async (_req, context) => {
      receivedUserId = context.userId;
      receivedTenantId = context.tenantId;
      return new Response("success");
    });

    const request = new Request("http://localhost/api/test", {
      headers: {
        Cookie: "session_token=valid-token",
      },
    });

    await handler(request);

    expect(receivedUserId).toBe("user-123");
    expect(receivedTenantId).toBe("tenant-456");
  });

  test("returns handler response when authentication succeeds", async () => {
    const authedRoute = createAuthedRoute(mockAuthMiddleware);
    const handler = authedRoute(async () =>
      new Response(JSON.stringify({ data: "test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const request = new Request("http://localhost/api/test", {
      headers: {
        Cookie: "session_token=valid-token",
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: "test" });
  });

  test("returns 401 when authentication fails", async () => {
    mockAuthenticate.mockImplementation(() => {
      throw new AuthenticationError("Invalid session");
    });

    const authedRoute = createAuthedRoute(mockAuthMiddleware);
    const handler = authedRoute(async () => new Response("success"));

    const request = new Request("http://localhost/api/test");

    const response = await handler(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  test("rethrows non-authentication errors", async () => {
    mockAuthenticate.mockImplementation(() => {
      throw new Error("Database error");
    });

    const authedRoute = createAuthedRoute(mockAuthMiddleware);
    const handler = authedRoute(async () => new Response("success"));

    const request = new Request("http://localhost/api/test");

    await expect(handler(request)).rejects.toThrow("Database error");
  });

  describe("session refresh", () => {
    test("adds refresh cookies to response when refresh is present in context", async () => {
      const refresh: SessionRefresh = {
        sessionToken: "test-session-token",
        csrfToken: "test-csrf-token",
        expiresAt: new Date("2026-01-25"),
      };

      mockAuthenticate.mockImplementation(() =>
        Promise.resolve({
          userId: "user-123",
          tenantId: "tenant-456",
          refresh,
        } as AuthContext)
      );

      const authedRoute = createAuthedRoute(mockAuthMiddleware);
      const handler = authedRoute(async () => new Response("success"));

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const response = await handler(request);

      const cookies = response.headers.getSetCookie();
      expect(cookies.length).toBeGreaterThanOrEqual(1);

      const sessionCookie = cookies.find((c) => c.includes("session_token="));
      expect(sessionCookie).toContain("test-session-token");
    });

    test("does not add refresh cookies when refresh is not present", async () => {
      const authedRoute = createAuthedRoute(mockAuthMiddleware);
      const handler = authedRoute(async () => new Response("success"));

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const response = await handler(request);

      const cookies = response.headers.getSetCookie();
      const sessionCookie = cookies.find((c) => c.includes("session_token="));
      expect(sessionCookie).toBeUndefined();
    });

    test("preserves original response body when adding cookies", async () => {
      const refresh: SessionRefresh = {
        sessionToken: "test-session-token",
        csrfToken: "test-csrf-token",
        expiresAt: new Date("2026-01-25"),
      };

      mockAuthenticate.mockImplementation(() =>
        Promise.resolve({
          userId: "user-123",
          tenantId: "tenant-456",
          refresh,
        } as AuthContext)
      );

      const authedRoute = createAuthedRoute(mockAuthMiddleware);
      const handler = authedRoute(async () =>
        new Response(JSON.stringify({ result: "data" }), {
          headers: { "Content-Type": "application/json" },
        })
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const response = await handler(request);
      const body = await response.json();

      expect(body).toEqual({ result: "data" });
    });
  });

  test("works with synchronous handler", async () => {
    const authedRoute = createAuthedRoute(mockAuthMiddleware);
    const handler = authedRoute(() => new Response("sync response"));

    const request = new Request("http://localhost/api/test", {
      headers: {
        Cookie: "session_token=valid-token",
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe("sync response");
  });
});
