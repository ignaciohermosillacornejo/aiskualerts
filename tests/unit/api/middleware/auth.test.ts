/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, beforeEach, mock } from "bun:test";
import {
  createAuthMiddleware,
  AuthenticationError,
} from "../../../../src/api/middleware/auth";
import type { SessionRepository } from "../../../../src/db/repositories/session";
import type { UserRepository } from "../../../../src/db/repositories/user";
import { SESSION_TTL_DAYS, SESSION_REFRESH_THRESHOLD_DAYS } from "../../../../src/utils/cookies";

describe("Auth Middleware", () => {
  let mockSessionRepo: {
    findByToken: ReturnType<typeof mock>;
    refreshSession: ReturnType<typeof mock>;
  };
  let mockUserRepo: {
    getById: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockSessionRepo = {
      findByToken: mock(() =>
        Promise.resolve({
          id: "session-123",
          userId: "user-123",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 86400000 * 5), // 5 days from now (within refresh threshold)
        })
      ),
      refreshSession: mock(() => Promise.resolve()),
    };

    mockUserRepo = {
      getById: mock(() =>
        Promise.resolve({
          id: "user-123",
          tenant_id: "tenant-456",
          email: "test@example.com",
          name: "Test User",
        })
      ),
    };
  });

  describe("authenticate", () => {
    test("returns auth context for valid session", async () => {
      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const result = await middleware.authenticate(request);

      expect(result.userId).toBe("user-123");
      expect(result.tenantId).toBe("tenant-456");
    });

    test("throws AuthenticationError for missing cookie header", async () => {
      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test");

      await expect(middleware.authenticate(request)).rejects.toThrow(
        AuthenticationError
      );
      await expect(middleware.authenticate(request)).rejects.toThrow(
        "No session cookie found"
      );
    });

    test("throws AuthenticationError for invalid cookie format", async () => {
      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "other_cookie=value",
        },
      });

      await expect(middleware.authenticate(request)).rejects.toThrow(
        AuthenticationError
      );
      await expect(middleware.authenticate(request)).rejects.toThrow(
        "Invalid session cookie"
      );
    });

    test("throws AuthenticationError for expired/invalid session", async () => {
      mockSessionRepo.findByToken.mockImplementation(() => Promise.resolve(null));

      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=expired-token",
        },
      });

      await expect(middleware.authenticate(request)).rejects.toThrow(
        AuthenticationError
      );
      await expect(middleware.authenticate(request)).rejects.toThrow(
        "Invalid or expired session"
      );
    });

    test("throws AuthenticationError when user not found", async () => {
      mockUserRepo.getById.mockImplementation(() => Promise.resolve(null));

      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      await expect(middleware.authenticate(request)).rejects.toThrow(
        AuthenticationError
      );
      await expect(middleware.authenticate(request)).rejects.toThrow(
        "User not found"
      );
    });

    test("calls sessionRepo.findByToken with correct token", async () => {
      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=my-session-token-123",
        },
      });

      await middleware.authenticate(request);

      expect(mockSessionRepo.findByToken).toHaveBeenCalledWith("my-session-token-123");
    });

    test("calls userRepo.getById with userId from session", async () => {
      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      await middleware.authenticate(request);

      expect(mockUserRepo.getById).toHaveBeenCalledWith("user-123");
    });

    test("handles cookies with multiple values", async () => {
      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "other=value; session_token=multi-cookie-token; another=data",
        },
      });

      await middleware.authenticate(request);

      expect(mockSessionRepo.findByToken).toHaveBeenCalledWith("multi-cookie-token");
    });
  });

  describe("AuthenticationError", () => {
    test("creates error with correct name", () => {
      const error = new AuthenticationError("Test auth error");
      expect(error.name).toBe("AuthenticationError");
      expect(error.message).toBe("Test auth error");
    });

    test("is instance of Error", () => {
      const error = new AuthenticationError("Test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("sliding window session refresh", () => {
    test("does not include refresh when session has more than threshold days remaining", async () => {
      // Session expires in 5 days (above 3.5 day threshold)
      mockSessionRepo.findByToken.mockImplementation(() =>
        Promise.resolve({
          id: "session-123",
          userId: "user-123",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 86400000 * 5), // 5 days
        })
      );

      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const result = await middleware.authenticate(request);

      expect(result.refresh).toBeUndefined();
      expect(mockSessionRepo.refreshSession).not.toHaveBeenCalled();
    });

    test("includes refresh when session has less than threshold days remaining", async () => {
      // Session expires in 2 days (below 3.5 day threshold)
      mockSessionRepo.findByToken.mockImplementation(() =>
        Promise.resolve({
          id: "session-123",
          userId: "user-123",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 86400000 * 2), // 2 days
        })
      );

      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token; csrf_token=test-csrf-token",
        },
      });

      const result = await middleware.authenticate(request);

      expect(result.refresh).toBeDefined();
      expect(result.refresh?.sessionToken).toBe("valid-token");
      expect(result.refresh?.csrfToken).toBe("test-csrf-token");
      expect(mockSessionRepo.refreshSession).toHaveBeenCalled();
    });

    test("calls refreshSession with new expiry date extended by SESSION_TTL_DAYS", async () => {
      // Session expires in 1 day
      mockSessionRepo.findByToken.mockImplementation(() =>
        Promise.resolve({
          id: "session-123",
          userId: "user-123",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 86400000), // 1 day
        })
      );

      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const beforeCall = Date.now();
      await middleware.authenticate(request);
      const afterCall = Date.now();

      expect(mockSessionRepo.refreshSession).toHaveBeenCalledTimes(1);
      const callArgs = mockSessionRepo.refreshSession.mock.calls[0] as [string, Date];
      const [token, newExpiresAt] = callArgs;
      expect(token).toBe("valid-token");

      // Verify new expiry is approximately SESSION_TTL_DAYS from now
      const expectedMinExpiry = beforeCall + SESSION_TTL_DAYS * 86400000;
      const expectedMaxExpiry = afterCall + SESSION_TTL_DAYS * 86400000;
      const actualExpiry = newExpiresAt.getTime();

      expect(actualExpiry).toBeGreaterThanOrEqual(expectedMinExpiry - 1000);
      expect(actualExpiry).toBeLessThanOrEqual(expectedMaxExpiry + 1000);
    });

    test("sets empty string for csrfToken when no CSRF cookie present", async () => {
      mockSessionRepo.findByToken.mockImplementation(() =>
        Promise.resolve({
          id: "session-123",
          userId: "user-123",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 86400000), // 1 day
        })
      );

      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const result = await middleware.authenticate(request);

      expect(result.refresh).toBeDefined();
      expect(result.refresh?.csrfToken).toBe("");
    });

    test("refresh includes correct expiresAt date", async () => {
      mockSessionRepo.findByToken.mockImplementation(() =>
        Promise.resolve({
          id: "session-123",
          userId: "user-123",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 86400000 * 2), // 2 days
        })
      );

      const middleware = createAuthMiddleware(
        mockSessionRepo as unknown as SessionRepository,
        mockUserRepo as unknown as UserRepository
      );

      const request = new Request("http://localhost/api/test", {
        headers: {
          Cookie: "session_token=valid-token",
        },
      });

      const result = await middleware.authenticate(request);

      expect(result.refresh).toBeDefined();
      expect(result.refresh?.expiresAt).toBeInstanceOf(Date);

      // Verify expiresAt is approximately 7 days from now
      const now = Date.now();
      const expectedExpiry = now + SESSION_TTL_DAYS * 86400000;
      const actualExpiry = result.refresh?.expiresAt.getTime() ?? 0;

      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 5000);
      expect(actualExpiry).toBeLessThanOrEqual(expectedExpiry + 5000);
    });

    test("verifies SESSION_REFRESH_THRESHOLD_DAYS constant is used correctly", () => {
      // This test verifies the threshold value is what we expect
      expect(SESSION_REFRESH_THRESHOLD_DAYS).toBe(3.5);
      expect(SESSION_TTL_DAYS).toBe(7);
    });
  });
});
