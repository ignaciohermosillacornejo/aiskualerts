/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, beforeEach, mock } from "bun:test";
import {
  handleOAuthStart,
  handleOAuthCallback,
  OAuthError,
  type OAuthHandlerDeps,
} from "../../../../src/api/handlers/oauth";
import type { BsaleOAuthClient } from "../../../../src/bsale/oauth-client";
import type { TenantRepository } from "../../../../src/db/repositories/tenant";
import type { UserRepository } from "../../../../src/db/repositories/user";
import type { SessionRepository } from "../../../../src/db/repositories/session";
import type { OAuthStateStore } from "../../../../src/utils/oauth-state-store";

describe("OAuth Handlers", () => {
  let mockOAuthClient: {
    getAuthorizationUrl: ReturnType<typeof mock>;
    exchangeCodeForToken: ReturnType<typeof mock>;
  };
  let mockTenantRepo: {
    findByClientCode: ReturnType<typeof mock>;
    create: ReturnType<typeof mock>;
    update: ReturnType<typeof mock>;
    updateOwner: ReturnType<typeof mock>;
  };
  let mockUserRepo: {
    getByEmail: ReturnType<typeof mock>;
    create: ReturnType<typeof mock>;
  };
  let mockSessionRepo: {
    create: ReturnType<typeof mock>;
  };
  let mockStateStore: {
    set: ReturnType<typeof mock>;
    consume: ReturnType<typeof mock>;
  };
  let deps: OAuthHandlerDeps;

  beforeEach(() => {
    mockOAuthClient = {
      getAuthorizationUrl: mock(() => "https://bsale.com/oauth/authorize?client_id=test"),
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
      updateOwner: mock((tenantId: string, ownerId: string) =>
        Promise.resolve({
          id: tenantId,
          owner_id: ownerId,
          bsale_client_code: "test-client",
          bsale_client_name: "Test Company",
          bsale_access_token: "access-token-123",
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
    };

    mockStateStore = {
      set: mock(() => undefined),
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
  });

  describe("handleOAuthStart", () => {
    test("generates authorization URL with PKCE", () => {
      const result = handleOAuthStart({ clientCode: "test-client" }, deps);

      expect(result.authorizationUrl).toBe(
        "https://bsale.com/oauth/authorize?client_id=test"
      );
      expect(result.state).toBeDefined();
      expect(typeof result.state).toBe("string");
      expect(mockStateStore.set).toHaveBeenCalled();
    });

    test("stores state with code verifier", () => {
      handleOAuthStart({ clientCode: "test-client" }, deps);

      expect(mockStateStore.set).toHaveBeenCalledTimes(1);
      const [state, data] = mockStateStore.set.mock.calls[0] as [
        string,
        { codeVerifier: string; clientCode: string }
      ];
      expect(typeof state).toBe("string");
      expect(data.codeVerifier).toBeDefined();
      expect(data.clientCode).toBe("test-client");
    });

    test("throws OAuthError for empty client code", () => {
      expect(() => handleOAuthStart({ clientCode: "" }, deps)).toThrow(OAuthError);
      expect(() => handleOAuthStart({ clientCode: "" }, deps)).toThrow(
        "client_code is required"
      );
    });

    test("throws OAuthError for whitespace-only client code", () => {
      expect(() => handleOAuthStart({ clientCode: "   " }, deps)).toThrow(OAuthError);
    });

    test("passes client code and state to getAuthorizationUrl", () => {
      handleOAuthStart({ clientCode: "my-client" }, deps);

      expect(mockOAuthClient.getAuthorizationUrl).toHaveBeenCalledTimes(1);
      const [clientCode, state, codeChallenge] =
        mockOAuthClient.getAuthorizationUrl.mock.calls[0] as [string, string, string];
      expect(clientCode).toBe("my-client");
      expect(typeof state).toBe("string");
      expect(typeof codeChallenge).toBe("string");
    });
  });

  describe("handleOAuthCallback", () => {
    test("exchanges code for token and creates new tenant", async () => {
      const result = await handleOAuthCallback(
        { code: "auth-code-123", state: "valid-state" },
        deps
      );

      expect(result.sessionToken).toBeDefined();
      expect(result.userId).toBe("user-123");
      expect(result.tenantId).toBe("tenant-123");

      expect(mockStateStore.consume).toHaveBeenCalledWith("valid-state");
      expect(mockOAuthClient.exchangeCodeForToken).toHaveBeenCalledWith(
        "auth-code-123",
        "test-verifier"
      );
      expect(mockTenantRepo.create).toHaveBeenCalled();
      expect(mockUserRepo.create).toHaveBeenCalled();
      expect(mockSessionRepo.create).toHaveBeenCalled();
    });

    test("updates existing tenant instead of creating new", async () => {
      mockTenantRepo.findByClientCode.mockImplementation(() =>
        Promise.resolve({
          id: "existing-tenant",
          bsale_client_code: "test-client",
          bsale_client_name: "Old Name",
          bsale_access_token: "old-token",
        })
      );
      mockTenantRepo.update.mockImplementation(() =>
        Promise.resolve({
          id: "existing-tenant",
          bsale_client_code: "test-client",
          bsale_client_name: "Test Company",
          bsale_access_token: "access-token-123",
        })
      );

      const result = await handleOAuthCallback(
        { code: "auth-code-123", state: "valid-state" },
        deps
      );

      expect(result.tenantId).toBe("existing-tenant");
      expect(mockTenantRepo.update).toHaveBeenCalledWith("existing-tenant", {
        bsale_access_token: "access-token-123",
        bsale_client_name: "Test Company",
      });
      expect(mockTenantRepo.create).not.toHaveBeenCalled();
    });

    test("finds existing user instead of creating new", async () => {
      mockUserRepo.getByEmail.mockImplementation(() =>
        Promise.resolve({
          id: "existing-user",
          tenant_id: "tenant-123",
          email: "admin@test-client",
          name: "Existing User",
        })
      );

      const result = await handleOAuthCallback(
        { code: "auth-code-123", state: "valid-state" },
        deps
      );

      expect(result.userId).toBe("existing-user");
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    test("throws OAuthError for empty code", async () => {
      await expect(
        handleOAuthCallback({ code: "", state: "valid-state" }, deps)
      ).rejects.toThrow(OAuthError);
      await expect(
        handleOAuthCallback({ code: "", state: "valid-state" }, deps)
      ).rejects.toThrow("authorization code is required");
    });

    test("throws OAuthError for whitespace-only code", async () => {
      await expect(
        handleOAuthCallback({ code: "   ", state: "valid-state" }, deps)
      ).rejects.toThrow(OAuthError);
    });

    test("throws OAuthError for empty state", async () => {
      await expect(
        handleOAuthCallback({ code: "auth-code", state: "" }, deps)
      ).rejects.toThrow(OAuthError);
      await expect(
        handleOAuthCallback({ code: "auth-code", state: "" }, deps)
      ).rejects.toThrow("state parameter is required");
    });

    test("throws OAuthError for whitespace-only state", async () => {
      await expect(
        handleOAuthCallback({ code: "auth-code", state: "   " }, deps)
      ).rejects.toThrow(OAuthError);
    });

    test("throws OAuthError for invalid state", async () => {
      mockStateStore.consume.mockImplementation(() => null);

      await expect(
        handleOAuthCallback({ code: "auth-code", state: "invalid-state" }, deps)
      ).rejects.toThrow(OAuthError);
      await expect(
        handleOAuthCallback({ code: "auth-code", state: "invalid-state" }, deps)
      ).rejects.toThrow("invalid or expired state parameter");
    });

    test("creates session with 7-day expiry (sliding window will extend)", async () => {
      await handleOAuthCallback(
        { code: "auth-code-123", state: "valid-state" },
        deps
      );

      expect(mockSessionRepo.create).toHaveBeenCalledTimes(1);
      const createCall = mockSessionRepo.create.mock.calls[0] as [
        { userId: string; token: string; expiresAt: Date }
      ];
      const sessionData = createCall[0];

      expect(sessionData.userId).toBe("user-123");
      expect(typeof sessionData.token).toBe("string");
      expect(sessionData.token.length).toBe(64); // 32 bytes hex
      expect(sessionData.expiresAt).toBeInstanceOf(Date);

      // Check expiry is approximately 7 days from now (sliding window will extend)
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(sessionData.expiresAt.getTime()).toBeGreaterThanOrEqual(
        expectedExpiry.getTime() - 5000
      );
      expect(sessionData.expiresAt.getTime()).toBeLessThanOrEqual(
        expectedExpiry.getTime() + 5000
      );
    });
  });

  describe("Add Tenant Flow (authenticated user)", () => {
    let mockUserTenantsRepo: {
      hasAccess: ReturnType<typeof mock>;
      create: ReturnType<typeof mock>;
    };

    beforeEach(() => {
      mockUserTenantsRepo = {
        hasAccess: mock(() => Promise.resolve(false)),
        create: mock(() => Promise.resolve({})),
      };

      // Add getById to userRepo for this flow
      (mockUserRepo as { getById?: ReturnType<typeof mock> }).getById = mock(
        () =>
          Promise.resolve({
            id: "auth-user-123",
            tenant_id: "some-tenant",
            email: "existing@example.com",
            name: "Existing User",
          })
      );
    });

    test("creates new tenant for authenticated user", async () => {
      const depsWithUserTenants = {
        ...deps,
        userTenantsRepo: mockUserTenantsRepo as unknown as import("../../../../src/db/repositories/user-tenants").UserTenantsRepository,
      };

      const result = await handleOAuthCallback(
        { code: "auth-code", state: "valid-state", authenticatedUserId: "auth-user-123" },
        depsWithUserTenants
      );

      expect(result.userId).toBe("auth-user-123");
      expect(result.tenantId).toBe("tenant-123");
      expect(mockTenantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_id: "auth-user-123",
          bsale_client_code: "test-client",
        })
      );
    });

    test("creates user_tenants entry for new tenant", async () => {
      const depsWithUserTenants = {
        ...deps,
        userTenantsRepo: mockUserTenantsRepo as unknown as import("../../../../src/db/repositories/user-tenants").UserTenantsRepository,
      };

      await handleOAuthCallback(
        { code: "auth-code", state: "valid-state", authenticatedUserId: "auth-user-123" },
        depsWithUserTenants
      );

      expect(mockUserTenantsRepo.create).toHaveBeenCalledWith({
        user_id: "auth-user-123",
        tenant_id: "tenant-123",
        role: "owner",
      });
    });

    test("does not create new session for authenticated user", async () => {
      const depsWithUserTenants = {
        ...deps,
        userTenantsRepo: mockUserTenantsRepo as unknown as import("../../../../src/db/repositories/user-tenants").UserTenantsRepository,
      };

      const result = await handleOAuthCallback(
        { code: "auth-code", state: "valid-state", authenticatedUserId: "auth-user-123" },
        depsWithUserTenants
      );

      expect(result.sessionToken).toBe("");
      expect(mockSessionRepo.create).not.toHaveBeenCalled();
    });

    test("throws error when tenant exists with different owner", async () => {
      mockTenantRepo.findByClientCode.mockResolvedValue({
        id: "existing-tenant",
        owner_id: "different-user",
        bsale_client_code: "test-client",
      });

      const depsWithUserTenants = {
        ...deps,
        userTenantsRepo: mockUserTenantsRepo as unknown as import("../../../../src/db/repositories/user-tenants").UserTenantsRepository,
      };

      await expect(
        handleOAuthCallback(
          { code: "auth-code", state: "valid-state", authenticatedUserId: "auth-user-123" },
          depsWithUserTenants
        )
      ).rejects.toThrow("This Bsale account is already connected to another user");
    });

    test("allows reconnecting if user already has access", async () => {
      mockTenantRepo.findByClientCode.mockResolvedValue({
        id: "existing-tenant",
        owner_id: "different-user",
        bsale_client_code: "test-client",
      });
      mockTenantRepo.update.mockResolvedValue({
        id: "existing-tenant",
        owner_id: "different-user",
        bsale_client_code: "test-client",
      });
      mockUserTenantsRepo.hasAccess.mockResolvedValue(true);

      const depsWithUserTenants = {
        ...deps,
        userTenantsRepo: mockUserTenantsRepo as unknown as import("../../../../src/db/repositories/user-tenants").UserTenantsRepository,
      };

      const result = await handleOAuthCallback(
        { code: "auth-code", state: "valid-state", authenticatedUserId: "auth-user-123" },
        depsWithUserTenants
      );

      expect(result.tenantId).toBe("existing-tenant");
      expect(mockTenantRepo.update).toHaveBeenCalled();
    });

    test("allows owner to reconnect their own tenant", async () => {
      mockTenantRepo.findByClientCode.mockResolvedValue({
        id: "existing-tenant",
        owner_id: "auth-user-123",
        bsale_client_code: "test-client",
      });
      mockTenantRepo.update.mockResolvedValue({
        id: "existing-tenant",
        owner_id: "auth-user-123",
        bsale_client_code: "test-client",
      });

      const depsWithUserTenants = {
        ...deps,
        userTenantsRepo: mockUserTenantsRepo as unknown as import("../../../../src/db/repositories/user-tenants").UserTenantsRepository,
      };

      const result = await handleOAuthCallback(
        { code: "auth-code", state: "valid-state", authenticatedUserId: "auth-user-123" },
        depsWithUserTenants
      );

      expect(result.tenantId).toBe("existing-tenant");
      expect(mockTenantRepo.update).toHaveBeenCalled();
    });
  });

  describe("OAuthError", () => {
    test("creates error with correct name", () => {
      const error = new OAuthError("Test error");
      expect(error.name).toBe("OAuthError");
      expect(error.message).toBe("Test error");
    });

    test("is instance of Error", () => {
      const error = new OAuthError("Test");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
