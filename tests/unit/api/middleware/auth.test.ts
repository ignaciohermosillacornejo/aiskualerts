/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, beforeEach, mock } from "bun:test";
import {
  createAuthMiddleware,
  AuthenticationError,
} from "../../../../src/api/middleware/auth";
import type { SessionRepository } from "../../../../src/db/repositories/session";
import type { UserRepository } from "../../../../src/db/repositories/user";

describe("Auth Middleware", () => {
  let mockSessionRepo: {
    findByToken: ReturnType<typeof mock>;
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
          expiresAt: new Date(Date.now() + 86400000),
        })
      ),
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
});
