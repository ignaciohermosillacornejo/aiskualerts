import { describe, test, expect, mock, type Mock } from "bun:test";
import { createAuthRoutes } from "../../../../src/api/routes/auth";
import type { SessionRepository } from "../../../../src/db/repositories/session";
import type { UserRepository } from "../../../../src/db/repositories/user";
import type { TenantRepository } from "../../../../src/db/repositories/tenant";
import type { UserTenantsRepository } from "../../../../src/db/repositories/user-tenants";
import type { User, Tenant, UserTenantWithTenant } from "../../../../src/db/repositories/types";

const mockUser: User = {
  id: "user-123",
  tenant_id: "tenant-456",
  email: "test@example.com",
  name: "Test User",
  last_tenant_id: "tenant-456",
  notification_enabled: true,
  notification_email: null,
  digest_frequency: "daily",
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
};

const mockTenant: Tenant = {
  id: "tenant-456",
  owner_id: "user-123",
  bsale_client_code: "12345678-9",
  bsale_client_name: "Test Company",
  bsale_access_token: "test-token",
  sync_status: "success",
  last_sync_at: new Date(),
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockUserTenants: UserTenantWithTenant[] = [
  {
    id: "ut-1",
    user_id: "user-123",
    tenant_id: "tenant-456",
    role: "owner",
    notification_enabled: true,
    notification_email: null,
    digest_frequency: "daily",
    created_at: new Date(),
    tenant_name: "Test Company",
    bsale_client_code: "12345678-9",
    sync_status: "success",
  },
  {
    id: "ut-2",
    user_id: "user-123",
    tenant_id: "tenant-789",
    role: "member",
    notification_enabled: true,
    notification_email: null,
    digest_frequency: "weekly",
    created_at: new Date(),
    tenant_name: "Other Company",
    bsale_client_code: "98765432-1",
    sync_status: "pending",
  },
];

interface MockDeps {
  sessionRepo: {
    findByToken: Mock<() => Promise<unknown>>;
  };
  userRepo: {
    getById: Mock<() => Promise<User | null>>;
  };
  tenantRepo: {
    getById: Mock<() => Promise<Tenant | null>>;
  };
  userTenantsRepo: {
    getTenantsForUser: Mock<() => Promise<UserTenantWithTenant[]>>;
    getRole: Mock<() => Promise<string | null>>;
  };
}

function createMockDeps(): MockDeps {
  return {
    sessionRepo: {
      findByToken: mock(() =>
        Promise.resolve({
          id: "session-1",
          userId: "user-123",
          currentTenantId: "tenant-456",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 86400000),
        })
      ),
    },
    userRepo: {
      getById: mock(() => Promise.resolve(mockUser)),
    },
    tenantRepo: {
      getById: mock(() => Promise.resolve(mockTenant)),
    },
    userTenantsRepo: {
      getTenantsForUser: mock(() => Promise.resolve(mockUserTenants)),
      getRole: mock(() => Promise.resolve("owner")),
    },
  };
}

describe("Auth Routes - /api/auth/me", () => {
  test("returns 401 when no session token", async () => {
    const mocks = createMockDeps();
    const routes = createAuthRoutes({
      sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
      userRepo: mocks.userRepo as unknown as UserRepository,
    });

    const req = new Request("http://localhost/api/auth/me");
    const response = await routes["/api/auth/me"].GET(req);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { user: null };
    expect(body.user).toBeNull();
  });

  test("returns 401 when session not found", async () => {
    const mocks = createMockDeps();
    mocks.sessionRepo.findByToken.mockResolvedValueOnce(null);

    const routes = createAuthRoutes({
      sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
      userRepo: mocks.userRepo as unknown as UserRepository,
    });

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "session_token=invalid-token" },
    });
    const response = await routes["/api/auth/me"].GET(req);

    expect(response.status).toBe(401);
  });

  test("returns user data with tenants list", async () => {
    const mocks = createMockDeps();
    const routes = createAuthRoutes({
      sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
      userRepo: mocks.userRepo as unknown as UserRepository,
      tenantRepo: mocks.tenantRepo as unknown as TenantRepository,
      userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
    });

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "session_token=valid-token" },
    });
    const response = await routes["/api/auth/me"].GET(req);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { id: string; email: string; name: string; subscriptionStatus: string };
      currentTenant: { id: string; name: string; bsaleClientCode: string; syncStatus: string } | null;
      tenants: { id: string; name: string; bsaleClientCode: string; role: string; syncStatus: string }[];
      role: string | null;
    };

    expect(body.user.id).toBe("user-123");
    expect(body.user.email).toBe("test@example.com");
    expect(body.user.subscriptionStatus).toBe("none");
  });

  test("returns current tenant info when set", async () => {
    const mocks = createMockDeps();
    const routes = createAuthRoutes({
      sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
      userRepo: mocks.userRepo as unknown as UserRepository,
      tenantRepo: mocks.tenantRepo as unknown as TenantRepository,
      userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
    });

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "session_token=valid-token" },
    });
    const response = await routes["/api/auth/me"].GET(req);
    const body = (await response.json()) as {
      currentTenant: { id: string; name: string; bsaleClientCode: string; syncStatus: string } | null;
    };

    expect(body.currentTenant).not.toBeNull();
    expect(body.currentTenant?.id).toBe("tenant-456");
    expect(body.currentTenant?.name).toBe("Test Company");
    expect(body.currentTenant?.syncStatus).toBe("success");
  });

  test("returns tenants list", async () => {
    const mocks = createMockDeps();
    const routes = createAuthRoutes({
      sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
      userRepo: mocks.userRepo as unknown as UserRepository,
      tenantRepo: mocks.tenantRepo as unknown as TenantRepository,
      userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
    });

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "session_token=valid-token" },
    });
    const response = await routes["/api/auth/me"].GET(req);
    const body = (await response.json()) as {
      tenants: { id: string; name: string; bsaleClientCode: string; role: string; syncStatus: string }[];
    };

    expect(body.tenants).toHaveLength(2);
    expect(body.tenants[0]?.id).toBe("tenant-456");
    expect(body.tenants[0]?.role).toBe("owner");
    expect(body.tenants[1]?.id).toBe("tenant-789");
    expect(body.tenants[1]?.role).toBe("member");
  });

  test("returns user role for current tenant", async () => {
    const mocks = createMockDeps();
    const routes = createAuthRoutes({
      sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
      userRepo: mocks.userRepo as unknown as UserRepository,
      tenantRepo: mocks.tenantRepo as unknown as TenantRepository,
      userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
    });

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "session_token=valid-token" },
    });
    const response = await routes["/api/auth/me"].GET(req);
    const body = (await response.json()) as { role: string | null };

    expect(body.role).toBe("owner");
    expect(mocks.userTenantsRepo.getRole).toHaveBeenCalledWith("user-123", "tenant-456");
  });

  test("returns null currentTenant when no current tenant set", async () => {
    const mocks = createMockDeps();
    mocks.sessionRepo.findByToken.mockResolvedValueOnce({
      id: "session-1",
      userId: "user-123",
      currentTenantId: null,
      token: "valid-token",
      expiresAt: new Date(Date.now() + 86400000),
    });

    const routes = createAuthRoutes({
      sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
      userRepo: mocks.userRepo as unknown as UserRepository,
      tenantRepo: mocks.tenantRepo as unknown as TenantRepository,
      userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
    });

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "session_token=valid-token" },
    });
    const response = await routes["/api/auth/me"].GET(req);
    const body = (await response.json()) as {
      currentTenant: null;
      role: string | null;
    };

    expect(body.currentTenant).toBeNull();
    expect(body.role).toBeNull();
  });

  test("returns mock data when no repositories provided", async () => {
    const routes = createAuthRoutes({});

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "session_token=valid-token" },
    });
    const response = await routes["/api/auth/me"].GET(req);
    const body = (await response.json()) as {
      user: { id: string };
      currentTenant: null;
      tenants: unknown[];
      role: null;
    };

    expect(response.status).toBe(200);
    expect(body.user.id).toBe("u1");
    expect(body.currentTenant).toBeNull();
    expect(body.tenants).toHaveLength(0);
    expect(body.role).toBeNull();
  });
});
