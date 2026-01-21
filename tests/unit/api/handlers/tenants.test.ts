import { describe, test, expect, mock, type Mock } from "bun:test";
import {
  handleGetTenants,
  type TenantsHandlerDeps,
} from "../../../../src/api/handlers/tenants";
import type { UserTenantsRepository } from "../../../../src/db/repositories/user-tenants";
import type { UserTenantWithTenant } from "../../../../src/db/repositories/types";

interface MockDeps {
  userTenantsRepo: {
    getTenantsForUser: Mock<() => Promise<UserTenantWithTenant[]>>;
  };
}

function createMockDeps(): { deps: TenantsHandlerDeps; mocks: MockDeps } {
  const mocks: MockDeps = {
    userTenantsRepo: {
      getTenantsForUser: mock(() => Promise.resolve([])),
    },
  };

  const deps: TenantsHandlerDeps = {
    userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
  };

  return { deps, mocks };
}

const mockTenantDetails: UserTenantWithTenant[] = [
  {
    id: "ut-1",
    user_id: "user-123",
    tenant_id: "tenant-1",
    role: "owner",
    notification_enabled: true,
    notification_email: null,
    digest_frequency: "daily",
    created_at: new Date("2024-01-01"),
    tenant_name: "Store A",
    bsale_client_code: "12345678-9",
    sync_status: "success",
  },
  {
    id: "ut-2",
    user_id: "user-123",
    tenant_id: "tenant-2",
    role: "member",
    notification_enabled: false,
    notification_email: "alerts@example.com",
    digest_frequency: "weekly",
    created_at: new Date("2024-02-01"),
    tenant_name: "Store B",
    bsale_client_code: "98765432-1",
    sync_status: "pending",
  },
];

describe("handleGetTenants", () => {
  test("returns user tenants with details", async () => {
    const { deps, mocks } = createMockDeps();
    mocks.userTenantsRepo.getTenantsForUser.mockResolvedValueOnce(
      mockTenantDetails
    );

    const result = await handleGetTenants({ userId: "user-123" }, deps);

    expect(result.tenants).toHaveLength(2);
    expect(mocks.userTenantsRepo.getTenantsForUser).toHaveBeenCalledWith(
      "user-123"
    );
  });

  test("returns mapped tenant data with correct fields", async () => {
    const { deps, mocks } = createMockDeps();
    mocks.userTenantsRepo.getTenantsForUser.mockResolvedValueOnce(
      mockTenantDetails
    );

    const result = await handleGetTenants({ userId: "user-123" }, deps);

    expect(result.tenants[0]).toEqual({
      id: "tenant-1",
      name: "Store A",
      bsaleClientCode: "12345678-9",
      role: "owner",
      syncStatus: "success",
    });
    expect(result.tenants[1]).toEqual({
      id: "tenant-2",
      name: "Store B",
      bsaleClientCode: "98765432-1",
      role: "member",
      syncStatus: "pending",
    });
  });

  test("returns empty array when user has no tenants", async () => {
    const { deps, mocks } = createMockDeps();
    mocks.userTenantsRepo.getTenantsForUser.mockResolvedValueOnce([]);

    const result = await handleGetTenants({ userId: "user-123" }, deps);

    expect(result.tenants).toHaveLength(0);
  });

  test("preserves role information correctly", async () => {
    const { deps, mocks } = createMockDeps();
    mocks.userTenantsRepo.getTenantsForUser.mockResolvedValueOnce(
      mockTenantDetails
    );

    const result = await handleGetTenants({ userId: "user-123" }, deps);

    expect(result.tenants[0]?.role).toBe("owner");
    expect(result.tenants[1]?.role).toBe("member");
  });
});
