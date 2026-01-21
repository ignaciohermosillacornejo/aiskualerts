import { describe, test, expect, mock, beforeEach } from "bun:test";
import { UserTenantsRepository } from "../../../../src/db/repositories/user-tenants";
import type { DatabaseClient } from "../../../../src/db/client";
import type { UserTenant } from "../../../../src/db/repositories/types";

interface MockDb {
  query: ReturnType<typeof mock>;
  queryOne: ReturnType<typeof mock>;
  execute: ReturnType<typeof mock>;
}

function createMockDb(): { db: DatabaseClient; mocks: MockDb } {
  const mocks: MockDb = {
    query: mock(() => Promise.resolve([])),
    queryOne: mock(() => Promise.resolve(null)),
    execute: mock(() => Promise.resolve()),
  };
  return { db: mocks as unknown as DatabaseClient, mocks };
}

const mockUserTenant: UserTenant = {
  id: "ut-123",
  user_id: "user-123",
  tenant_id: "tenant-456",
  role: "owner",
  notification_enabled: true,
  notification_email: null,
  digest_frequency: "daily",
  created_at: new Date("2024-01-01"),
};

describe("UserTenantsRepository", () => {
  let repo: UserTenantsRepository;
  let mocks: MockDb;

  beforeEach(() => {
    const { db, mocks: m } = createMockDb();
    mocks = m;
    repo = new UserTenantsRepository(db);
  });

  describe("create", () => {
    test("creates user-tenant membership", async () => {
      mocks.query.mockResolvedValueOnce([mockUserTenant]);

      const result = await repo.create({
        user_id: "user-123",
        tenant_id: "tenant-456",
        role: "owner",
      });

      expect(result).toEqual(mockUserTenant);
      expect(mocks.query.mock.calls[0]?.[0]).toContain("INSERT INTO user_tenants");
    });

    test("creates membership with default values", async () => {
      const defaultMembership = { ...mockUserTenant, role: "member" };
      mocks.query.mockResolvedValueOnce([defaultMembership]);

      const result = await repo.create({
        user_id: "user-123",
        tenant_id: "tenant-456",
      });

      expect(result.role).toBe("member");
    });

    test("throws if creation fails", async () => {
      mocks.query.mockResolvedValueOnce([]);

      await expect(
        repo.create({ user_id: "user-123", tenant_id: "tenant-456", role: "owner" })
      ).rejects.toThrow("Failed to create user-tenant membership");
    });
  });

  describe("findByUserAndTenant", () => {
    test("returns membership if exists", async () => {
      mocks.queryOne.mockResolvedValueOnce(mockUserTenant);

      const result = await repo.findByUserAndTenant("user-123", "tenant-456");

      expect(result).toEqual(mockUserTenant);
      expect(mocks.queryOne.mock.calls[0]?.[1]).toEqual(["user-123", "tenant-456"]);
    });

    test("returns null if not found", async () => {
      mocks.queryOne.mockResolvedValueOnce(null);

      const result = await repo.findByUserAndTenant("user-123", "tenant-456");

      expect(result).toBeNull();
    });
  });

  describe("getTenantsForUser", () => {
    test("returns all tenants for user with tenant details", async () => {
      const tenantsWithDetails = [
        { ...mockUserTenant, tenant_name: "Store A", bsale_client_code: "12345", sync_status: "success" },
      ];
      mocks.query.mockResolvedValueOnce(tenantsWithDetails);

      const result = await repo.getTenantsForUser("user-123");

      expect(result).toEqual(tenantsWithDetails);
      expect(mocks.query.mock.calls[0]?.[0]).toContain("JOIN tenants");
    });

    test("returns empty array if user has no tenants", async () => {
      mocks.query.mockResolvedValueOnce([]);

      const result = await repo.getTenantsForUser("user-123");

      expect(result).toEqual([]);
    });
  });

  describe("getUsersForTenant", () => {
    test("returns all users for tenant", async () => {
      mocks.query.mockResolvedValueOnce([mockUserTenant]);

      const result = await repo.getUsersForTenant("tenant-456");

      expect(result).toHaveLength(1);
      expect(mocks.query.mock.calls[0]?.[1]).toEqual(["tenant-456"]);
    });
  });

  describe("updateRole", () => {
    test("updates role for membership", async () => {
      mocks.queryOne.mockResolvedValueOnce({ ...mockUserTenant, role: "admin" });

      const result = await repo.updateRole("user-123", "tenant-456", "admin");

      expect(result?.role).toBe("admin");
      expect(mocks.queryOne.mock.calls[0]?.[0]).toContain("UPDATE user_tenants");
    });

    test("returns null if membership not found", async () => {
      mocks.queryOne.mockResolvedValueOnce(null);

      const result = await repo.updateRole("user-123", "tenant-456", "admin");

      expect(result).toBeNull();
    });
  });

  describe("updateNotificationSettings", () => {
    test("updates notification settings", async () => {
      const updated = { ...mockUserTenant, notification_enabled: false, digest_frequency: "weekly" };
      mocks.queryOne.mockResolvedValueOnce(updated);

      const result = await repo.updateNotificationSettings("user-123", "tenant-456", {
        notification_enabled: false,
        digest_frequency: "weekly",
      });

      expect(result?.notification_enabled).toBe(false);
      expect(result?.digest_frequency).toBe("weekly");
    });

    test("updates only provided fields", async () => {
      const updated = { ...mockUserTenant, notification_email: "new@example.com" };
      mocks.queryOne.mockResolvedValueOnce(updated);

      const result = await repo.updateNotificationSettings("user-123", "tenant-456", {
        notification_email: "new@example.com",
      });

      expect(result?.notification_email).toBe("new@example.com");
    });

    test("returns existing membership if no updates provided", async () => {
      mocks.queryOne.mockResolvedValueOnce(mockUserTenant);

      const result = await repo.updateNotificationSettings("user-123", "tenant-456", {});

      expect(result).toEqual(mockUserTenant);
      // Should call findByUserAndTenant, not UPDATE
      expect(mocks.queryOne.mock.calls[0]?.[0]).toContain("SELECT");
    });
  });

  describe("delete", () => {
    test("deletes membership", async () => {
      await repo.delete("user-123", "tenant-456");

      expect(mocks.execute.mock.calls[0]?.[0]).toContain("DELETE FROM user_tenants");
      expect(mocks.execute.mock.calls[0]?.[1]).toEqual(["user-123", "tenant-456"]);
    });
  });

  describe("hasAccess", () => {
    test("returns true if membership exists", async () => {
      mocks.queryOne.mockResolvedValueOnce(mockUserTenant);

      const result = await repo.hasAccess("user-123", "tenant-456");

      expect(result).toBe(true);
    });

    test("returns false if no membership", async () => {
      mocks.queryOne.mockResolvedValueOnce(null);

      const result = await repo.hasAccess("user-123", "tenant-456");

      expect(result).toBe(false);
    });
  });

  describe("getRole", () => {
    test("returns role for membership", async () => {
      mocks.queryOne.mockResolvedValueOnce({ role: "admin" });

      const result = await repo.getRole("user-123", "tenant-456");

      expect(result).toBe("admin");
    });

    test("returns null if no membership", async () => {
      mocks.queryOne.mockResolvedValueOnce(null);

      const result = await repo.getRole("user-123", "tenant-456");

      expect(result).toBeNull();
    });
  });
});
