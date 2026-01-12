/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-empty-function, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { test, expect, describe, beforeEach, mock } from "bun:test";
import { createOAuthRoutes } from "../../../../src/api/routes/oauth";
import type { OAuthHandlerDeps } from "../../../../src/api/handlers/oauth";
import type { BsaleOAuthClient } from "../../../../src/bsale/oauth-client";
import type { TenantRepository } from "../../../../src/db/repositories/tenant";
import type { UserRepository } from "../../../../src/db/repositories/user";
import type { SessionRepository } from "../../../../src/db/repositories/session";
import type { OAuthStateStore } from "../../../../src/utils/oauth-state-store";

describe("OAuth Routes", () => {
  let mockOAuthClient: {
    getAuthorizationUrl: ReturnType<typeof mock>;
    exchangeCodeForToken: ReturnType<typeof mock>;
  };
  let mockTenantRepo: {
    findByClientCode: ReturnType<typeof mock>;
    create: ReturnType<typeof mock>;
    update: ReturnType<typeof mock>;
  };
  let mockUserRepo: {
    getByEmail: ReturnType<typeof mock>;
    create: ReturnType<typeof mock>;
  };
  let mockSessionRepo: {
    create: ReturnType<typeof mock>;
    deleteByToken: ReturnType<typeof mock>;
  };
  let mockStateStore: {
    set: ReturnType<typeof mock>;
    consume: ReturnType<typeof mock>;
  };
  let deps: OAuthHandlerDeps;
  let routes: ReturnType<typeof createOAuthRoutes>;

  beforeEach(() => {
    mockOAuthClient = {
      getAuthorizationUrl: mock(() => "https://bsale.com/oauth/authorize?client_id=test&state=xyz"),
      exchangeCodeForToken: mock(() =>
        Promise.resolve({
          data: {
            accessToken: "access-token-123",
            clientCode: "test-client",
            clientName: "Test Company",
          },
        })
      ),
    };

    mockTenantRepo = {
      findByClientCode: mock(() => Promise.resolve(null)),
      create: mock((input: { bsale_client_code: string }) =>
        Promise.resolve({
          id: "tenant-123",
          bsale_client_code: input.bsale_client_code,
          bsale_client_name: "Test Company",
          bsale_access_token: "access-token-123",
        })
      ),
      update: mock(() =>
        Promise.resolve({
          id: "tenant-123",
          bsale_client_code: "test-client",
          bsale_client_name: "Test Company",
          bsale_access_token: "new-access-token",
        })
      ),
    };

    mockUserRepo = {
      getByEmail: mock(() => Promise.resolve(null)),
      create: mock((input: { tenant_id: string; email: string; name: string }) =>
        Promise.resolve({
          id: "user-123",
          tenant_id: input.tenant_id,
          email: input.email,
          name: input.name,
        })
      ),
    };

    mockSessionRepo = {
      create: mock(() => Promise.resolve({ id: "session-123" })),
      deleteByToken: mock(() => Promise.resolve()),
    };

    mockStateStore = {
      set: mock(() => {}),
      consume: mock(() => ({
        codeVerifier: "test-verifier",
        clientCode: "test-client",
      })),
    };

    deps = {
      oauthClient: mockOAuthClient as unknown as BsaleOAuthClient,
      tenantRepo: mockTenantRepo as unknown as TenantRepository,
      userRepo: mockUserRepo as unknown as UserRepository,
      sessionRepo: mockSessionRepo as unknown as SessionRepository,
      stateStore: mockStateStore as unknown as OAuthStateStore,
    };

    routes = createOAuthRoutes(deps);
  });

  describe("start", () => {
    test("redirects to authorization URL with client_code", () => {
      const request = new Request("http://localhost/api/auth/bsale/start?client_code=test-client");
      const response = routes.start(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "https://bsale.com/oauth/authorize?client_id=test&state=xyz"
      );
    });

    test("returns 400 if client_code is missing", () => {
      const request = new Request("http://localhost/api/auth/bsale/start");
      const response = routes.start(request);

      expect(response.status).toBe(400);
    });

    test("returns 400 error body for missing client_code", async () => {
      const request = new Request("http://localhost/api/auth/bsale/start");
      const response = routes.start(request);
      const body = await response.json() as { error: string };

      expect(body.error).toBe("client_code query parameter is required");
    });

    test("returns 500 on internal error", () => {
      mockOAuthClient.getAuthorizationUrl.mockImplementation(() => {
        throw new Error("OAuth client error");
      });

      const request = new Request("http://localhost/api/auth/bsale/start?client_code=test");
      const response = routes.start(request);

      expect(response.status).toBe(500);
    });

    test("returns error message on internal error", async () => {
      mockOAuthClient.getAuthorizationUrl.mockImplementation(() => {
        throw new Error("OAuth client error");
      });

      const request = new Request("http://localhost/api/auth/bsale/start?client_code=test");
      const response = routes.start(request);
      const body = await response.json() as { error: string };

      expect(body.error).toBe("Failed to initiate OAuth flow");
    });
  });

  describe("callback", () => {
    test("sets session cookie and redirects to /app on success", async () => {
      const request = new Request(
        "http://localhost/api/auth/bsale/callback?code=auth-code&state=valid-state"
      );
      const response = await routes.callback(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/app");

      const cookie = response.headers.get("Set-Cookie") ?? "";
      expect(cookie).toContain("session_token=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=");
    });

    test("returns 400 if code is missing", async () => {
      const request = new Request(
        "http://localhost/api/auth/bsale/callback?state=valid-state"
      );
      const response = await routes.callback(request);

      expect(response.status).toBe(400);
    });

    test("returns error message for missing code", async () => {
      const request = new Request(
        "http://localhost/api/auth/bsale/callback?state=valid-state"
      );
      const response = await routes.callback(request);
      const body = await response.json() as { error: string };

      expect(body.error).toBe("authorization code is required");
    });

    test("returns 400 if state is missing", async () => {
      const request = new Request(
        "http://localhost/api/auth/bsale/callback?code=auth-code"
      );
      const response = await routes.callback(request);

      expect(response.status).toBe(400);
    });

    test("returns error message for missing state", async () => {
      const request = new Request(
        "http://localhost/api/auth/bsale/callback?code=auth-code"
      );
      const response = await routes.callback(request);
      const body = await response.json() as { error: string };

      expect(body.error).toBe("state parameter is required");
    });

    test("returns 500 on OAuth error", async () => {
      mockStateStore.consume.mockImplementation(() => null);

      const request = new Request(
        "http://localhost/api/auth/bsale/callback?code=auth-code&state=invalid-state"
      );
      const response = await routes.callback(request);

      expect(response.status).toBe(500);
    });

    test("returns error message on OAuth error", async () => {
      mockStateStore.consume.mockImplementation(() => null);

      const request = new Request(
        "http://localhost/api/auth/bsale/callback?code=auth-code&state=invalid-state"
      );
      const response = await routes.callback(request);
      const body = await response.json() as { error: string };

      expect(body.error).toBe("Failed to complete OAuth flow");
    });

    test("includes Secure and SameSite in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const request = new Request(
          "http://localhost/api/auth/bsale/callback?code=auth-code&state=valid-state"
        );
        const response = await routes.callback(request);
        const cookie = response.headers.get("Set-Cookie") ?? "";

        expect(cookie).toContain("Secure");
        expect(cookie).toContain("SameSite=Strict");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe("logout", () => {
    test("clears cookie and redirects to home", async () => {
      const request = new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "session_token=test-session-token",
        },
      });
      const response = await routes.logout(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");

      const cookie = response.headers.get("Set-Cookie") ?? "";
      expect(cookie).toContain("session_token=");
      expect(cookie).toContain("Max-Age=0");
    });

    test("deletes session from database", async () => {
      const request = new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "session_token=test-session-token",
        },
      });
      await routes.logout(request);

      expect(mockSessionRepo.deleteByToken).toHaveBeenCalledWith("test-session-token");
    });

    test("handles missing cookie gracefully", async () => {
      const request = new Request("http://localhost/api/auth/logout", {
        method: "POST",
      });
      const response = await routes.logout(request);

      expect(response.status).toBe(302);
      expect(mockSessionRepo.deleteByToken).not.toHaveBeenCalled();
    });

    test("handles missing session token in cookie gracefully", async () => {
      const request = new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "other_cookie=value",
        },
      });
      const response = await routes.logout(request);

      expect(response.status).toBe(302);
      expect(mockSessionRepo.deleteByToken).not.toHaveBeenCalled();
    });

    test("returns 500 on error", async () => {
      mockSessionRepo.deleteByToken.mockImplementation(() => {
        throw new Error("Database error");
      });

      const request = new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "session_token=test-session-token",
        },
      });
      const response = await routes.logout(request);

      expect(response.status).toBe(500);
    });

    test("returns error message on failure", async () => {
      mockSessionRepo.deleteByToken.mockImplementation(() => {
        throw new Error("Database error");
      });

      const request = new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "session_token=test-session-token",
        },
      });
      const response = await routes.logout(request);
      const body = await response.json() as { error: string };

      expect(body.error).toBe("Failed to logout");
    });
  });
});
