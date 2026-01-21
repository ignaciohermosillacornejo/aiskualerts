import { describe, test, expect, mock, type Mock } from "bun:test";
import { createTenantRoutes, type TenantRoutesDeps } from "../../../../src/api/routes/tenants";
import type { AuthMiddleware, AuthContext } from "../../../../src/api/middleware/auth";
import type { SessionRepository } from "../../../../src/db/repositories/session";
import type { UserRepository } from "../../../../src/db/repositories/user";
import type { UserTenantsRepository } from "../../../../src/db/repositories/user-tenants";
import type { UserTenantWithTenant } from "../../../../src/db/repositories/types";
import { AuthenticationError } from "../../../../src/api/middleware/auth";

const mockUserTenants: UserTenantWithTenant[] = [
  {
    id: "ut-1",
    user_id: "user-123",
    tenant_id: "tenant-1",
    role: "owner",
    notification_enabled: true,
    notification_email: null,
    digest_frequency: "daily",
    created_at: new Date(),
    tenant_name: "Store A",
    bsale_client_code: "12345678-9",
    sync_status: "success",
  },
  {
    id: "ut-2",
    user_id: "user-123",
    tenant_id: "tenant-2",
    role: "member",
    notification_enabled: true,
    notification_email: null,
    digest_frequency: "weekly",
    created_at: new Date(),
    tenant_name: "Store B",
    bsale_client_code: "98765432-1",
    sync_status: "pending",
  },
];

interface MockDeps {
  sessionRepo: {
    updateCurrentTenant: Mock<() => Promise<unknown>>;
  };
  userRepo: {
    updateLastTenant: Mock<() => Promise<unknown>>;
  };
  userTenantsRepo: {
    getTenantsForUser: Mock<() => Promise<UserTenantWithTenant[]>>;
    hasAccess: Mock<() => Promise<boolean>>;
  };
}

interface MockAuthMiddleware {
  authenticate: Mock<() => Promise<AuthContext>>;
}

function createMocks(): { deps: TenantRoutesDeps; authMiddleware: MockAuthMiddleware; mocks: MockDeps } {
  const mocks: MockDeps = {
    sessionRepo: {
      updateCurrentTenant: mock(() => Promise.resolve({})),
    },
    userRepo: {
      updateLastTenant: mock(() => Promise.resolve({})),
    },
    userTenantsRepo: {
      getTenantsForUser: mock(() => Promise.resolve(mockUserTenants)),
      hasAccess: mock(() => Promise.resolve(true)),
    },
  };

  const authMiddleware: MockAuthMiddleware = {
    authenticate: mock(() =>
      Promise.resolve({
        userId: "user-123",
        tenantId: "tenant-1",
        currentTenantId: "tenant-1",
        role: "owner" as const,
      })
    ),
  };

  const deps: TenantRoutesDeps = {
    sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
    userRepo: mocks.userRepo as unknown as UserRepository,
    userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
  };

  return { deps, authMiddleware, mocks };
}

describe("Tenant Routes", () => {
  describe("GET /api/tenants", () => {
    test("returns list of tenants for authenticated user", async () => {
      const { deps, authMiddleware } = createMocks();
      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants", {
        headers: { Cookie: "session_token=valid-token" },
      });

      const response = await routes["/api/tenants"].GET(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { tenants: unknown[] };
      expect(body.tenants).toHaveLength(2);
    });

    test("returns 401 when not authenticated", async () => {
      const { deps, authMiddleware } = createMocks();
      authMiddleware.authenticate.mockRejectedValue(
        new AuthenticationError("No session")
      );

      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants");
      const response = await routes["/api/tenants"].GET(req);

      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    test("maps tenant data correctly", async () => {
      const { deps, authMiddleware } = createMocks();
      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants", {
        headers: { Cookie: "session_token=valid-token" },
      });

      const response = await routes["/api/tenants"].GET(req);
      const body = (await response.json()) as {
        tenants: {
          id: string;
          name: string;
          bsaleClientCode: string;
          role: string;
          syncStatus: string;
        }[];
      };

      expect(body.tenants[0]?.id).toBe("tenant-1");
      expect(body.tenants[0]?.name).toBe("Store A");
      expect(body.tenants[0]?.role).toBe("owner");
      expect(body.tenants[1]?.id).toBe("tenant-2");
      expect(body.tenants[1]?.role).toBe("member");
    });
  });

  describe("POST /api/tenants/switch", () => {
    test("switches tenant successfully", async () => {
      const { deps, authMiddleware, mocks } = createMocks();
      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants/switch", {
        method: "POST",
        headers: {
          Cookie: "session_token=valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const response = await routes["/api/tenants/switch"].POST(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { success: boolean };
      expect(body.success).toBe(true);
      expect(mocks.userTenantsRepo.hasAccess).toHaveBeenCalledWith(
        "user-123",
        "550e8400-e29b-41d4-a716-446655440000"
      );
    });

    test("returns 401 when not authenticated", async () => {
      const { deps, authMiddleware } = createMocks();
      authMiddleware.authenticate.mockRejectedValue(
        new AuthenticationError("No session")
      );

      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const response = await routes["/api/tenants/switch"].POST(req);
      expect(response.status).toBe(401);
    });

    test("returns 400 for invalid tenant ID format", async () => {
      const { deps, authMiddleware } = createMocks();
      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants/switch", {
        method: "POST",
        headers: {
          Cookie: "session_token=valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: "not-a-uuid" }),
      });

      const response = await routes["/api/tenants/switch"].POST(req);
      expect(response.status).toBe(400);
    });

    test("returns 400 for invalid JSON body", async () => {
      const { deps, authMiddleware } = createMocks();
      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants/switch", {
        method: "POST",
        headers: {
          Cookie: "session_token=valid-token",
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      const response = await routes["/api/tenants/switch"].POST(req);
      expect(response.status).toBe(400);
    });

    test("returns 403 when user has no access to tenant", async () => {
      const { deps, authMiddleware, mocks } = createMocks();
      mocks.userTenantsRepo.hasAccess.mockResolvedValue(false);

      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants/switch", {
        method: "POST",
        headers: {
          Cookie: "session_token=valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const response = await routes["/api/tenants/switch"].POST(req);
      expect(response.status).toBe(403);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("No access to tenant");
    });

    test("updates session and user last tenant", async () => {
      const { deps, authMiddleware, mocks } = createMocks();
      const routes = createTenantRoutes(deps, authMiddleware as unknown as AuthMiddleware);

      const req = new Request("http://localhost/api/tenants/switch", {
        method: "POST",
        headers: {
          Cookie: "session_token=valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      await routes["/api/tenants/switch"].POST(req);

      expect(mocks.sessionRepo.updateCurrentTenant).toHaveBeenCalledWith(
        "valid-token",
        "550e8400-e29b-41d4-a716-446655440000"
      );
      expect(mocks.userRepo.updateLastTenant).toHaveBeenCalledWith(
        "user-123",
        "550e8400-e29b-41d4-a716-446655440000"
      );
    });
  });
});
