/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, mock, type Mock } from "bun:test";
import { TenantRepository } from "@/db/repositories/tenant";
import type { DatabaseClient } from "@/db/client";
import type { Tenant } from "@/db/repositories/types";

const mockTenant: Tenant = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  owner_id: "user-owner-123",
  bsale_client_code: "12345678-9",
  bsale_client_name: "Test Company",
  bsale_access_token: "test-token",
  sync_status: "pending",
  last_sync_at: null,
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

interface MockDb {
  query: Mock<() => Promise<unknown[]>>;
  queryOne: Mock<() => Promise<unknown>>;
  execute: Mock<() => Promise<void>>;
}

function createMockDb(): { db: DatabaseClient; mocks: MockDb } {
  const mocks: MockDb = {
    query: mock(() => Promise.resolve([])),
    queryOne: mock(() => Promise.resolve(null)),
    execute: mock(() => Promise.resolve()),
  };
  return {
    db: mocks as unknown as DatabaseClient,
    mocks,
  };
}

describe("TenantRepository", () => {
  describe("create", () => {
    test("creates tenant and returns it", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.create({
        owner_id: "user-owner-123",
        bsale_client_code: "12345678-9",
        bsale_client_name: "Test Company",
        bsale_access_token: "test-token",
      });

      expect(result).toEqual(mockTenant);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("throws error when creation fails", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new TenantRepository(db);

      await expect(
        repo.create({
          owner_id: "user-owner-123",
          bsale_client_code: "12345678-9",
          bsale_client_name: "Test Company",
          bsale_access_token: "test-token",
        })
      ).rejects.toThrow("Failed to create tenant");
    });
  });

  describe("getAll", () => {
    test("returns all tenants", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockTenant, { ...mockTenant, id: "second-id" }]);

      const repo = new TenantRepository(db);
      const result = await repo.getAll();

      expect(result.length).toBe(2);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no tenants", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new TenantRepository(db);
      const result = await repo.getAll();

      expect(result).toEqual([]);
    });
  });

  describe("findByClientCode", () => {
    test("returns tenant when found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockTenant);

      const repo = new TenantRepository(db);
      const result = await repo.findByClientCode("12345678-9");

      expect(result).toEqual(mockTenant);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new TenantRepository(db);
      const result = await repo.findByClientCode("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    test("updates tenant with all fields", async () => {
      const { db, mocks } = createMockDb();
      const updatedTenant = {
        ...mockTenant,
        bsale_client_name: "Updated Company",
        bsale_access_token: "new-token",
      };
      mocks.query.mockResolvedValue([updatedTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.update(mockTenant.id, {
        bsale_client_name: "Updated Company",
        bsale_access_token: "new-token",
      });

      expect(result.bsale_client_name).toBe("Updated Company");
      expect(mocks.query).toHaveBeenCalled();
    });

    test("updates tenant with only client_name", async () => {
      const { db, mocks } = createMockDb();
      const updatedTenant = { ...mockTenant, bsale_client_name: "New Name" };
      mocks.query.mockResolvedValue([updatedTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.update(mockTenant.id, {
        bsale_client_name: "New Name",
      });

      expect(result.bsale_client_name).toBe("New Name");
    });

    test("updates tenant with only access_token", async () => {
      const { db, mocks } = createMockDb();
      const updatedTenant = { ...mockTenant, bsale_access_token: "new-token" };
      mocks.query.mockResolvedValue([updatedTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.update(mockTenant.id, {
        bsale_access_token: "new-token",
      });

      expect(result.bsale_access_token).toBe("new-token");
    });

    test("returns existing tenant when no updates provided", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockTenant);

      const repo = new TenantRepository(db);
      const result = await repo.update(mockTenant.id, {});

      expect(result).toEqual(mockTenant);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("throws error when no updates and tenant not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new TenantRepository(db);

      await expect(repo.update("nonexistent", {})).rejects.toThrow(
        "Tenant nonexistent not found"
      );
    });

    test("throws error when update returns no rows", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new TenantRepository(db);

      await expect(
        repo.update("nonexistent", { bsale_client_name: "New Name" })
      ).rejects.toThrow("Tenant nonexistent not found");
    });
  });

  describe("getActiveTenants", () => {
    test("returns list of tenants not currently syncing", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.getActiveTenants();

      expect(result).toEqual([mockTenant]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no tenants exist", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new TenantRepository(db);
      const result = await repo.getActiveTenants();

      expect(result).toEqual([]);
    });
  });

  describe("getById", () => {
    test("returns tenant when found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockTenant);

      const repo = new TenantRepository(db);
      const result = await repo.getById(mockTenant.id);

      expect(result).toEqual(mockTenant);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when tenant not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new TenantRepository(db);
      const result = await repo.getById("non-existent-id");

      expect(result).toBeNull();
    });
  });

  describe("updateSyncStatus", () => {
    test("updates status without lastSyncAt", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);

      await repo.updateSyncStatus(mockTenant.id, "syncing");

      expect(mocks.execute).toHaveBeenCalled();
    });

    test("updates status with lastSyncAt", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);
      const lastSyncAt = new Date();

      await repo.updateSyncStatus(mockTenant.id, "success", lastSyncAt);

      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("getTenantsByStatus", () => {
    test("returns tenants with matching status", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.getTenantsByStatus("pending");

      expect(result).toEqual([mockTenant]);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("findBySubscriptionId", () => {
    test("returns tenant when found", async () => {
      const { db, mocks } = createMockDb();
      const paidTenant = { ...mockTenant, subscription_id: "sub_123", subscription_status: "active" as const };
      mocks.queryOne.mockResolvedValue(paidTenant);

      const repo = new TenantRepository(db);
      const result = await repo.findBySubscriptionId("sub_123");

      expect(result).toEqual(paidTenant);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when tenant not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new TenantRepository(db);
      const result = await repo.findBySubscriptionId("sub_nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("activateSubscription", () => {
    test("activates subscription and sets status to active", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);

      await repo.activateSubscription(mockTenant.id, "sub_123");

      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("updateSubscriptionStatus", () => {
    test("updates subscription status", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);

      await repo.updateSubscriptionStatus("sub_123", "cancelled");

      expect(mocks.execute).toHaveBeenCalled();
    });

    test("can set status with end date", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);
      const endsAt = new Date("2025-01-01");

      await repo.updateSubscriptionStatus("sub_123", "cancelled", endsAt);

      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("getByOwnerId", () => {
    test("returns tenants owned by user", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockTenant, { ...mockTenant, id: "second-tenant" }]);

      const repo = new TenantRepository(db);
      const result = await repo.getByOwnerId("user-owner-123");

      expect(result.length).toBe(2);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no tenants owned", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new TenantRepository(db);
      const result = await repo.getByOwnerId("user-no-tenants");

      expect(result).toEqual([]);
    });
  });

  describe("createForMagicLink", () => {
    test("creates tenant with owner_id and without Bsale connection", async () => {
      const { db, mocks } = createMockDb();
      const magicLinkTenant = {
        ...mockTenant,
        bsale_client_code: null,
        bsale_access_token: null,
        sync_status: "not_connected",
      };
      mocks.query.mockResolvedValue([magicLinkTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.createForMagicLink("user-owner-123", "test@example.com", "Test Name");

      expect(result.owner_id).toBe("user-owner-123");
      expect(mocks.query).toHaveBeenCalled();
    });

    test("uses email as name when name not provided", async () => {
      const { db, mocks } = createMockDb();
      const magicLinkTenant = {
        ...mockTenant,
        bsale_client_code: null,
        bsale_client_name: "test@example.com",
        bsale_access_token: null,
        sync_status: "not_connected",
      };
      mocks.query.mockResolvedValue([magicLinkTenant]);

      const repo = new TenantRepository(db);
      const result = await repo.createForMagicLink("user-owner-123", "test@example.com");

      expect(result.bsale_client_name).toBe("test@example.com");
    });
  });
});
