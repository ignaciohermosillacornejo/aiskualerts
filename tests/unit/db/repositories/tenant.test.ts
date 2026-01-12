import { test, expect, describe, mock, type Mock } from "bun:test";
import { TenantRepository } from "@/db/repositories/tenant";
import type { DatabaseClient } from "@/db/client";
import type { Tenant } from "@/db/repositories/types";

const mockTenant: Tenant = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  bsale_client_code: "12345678-9",
  bsale_client_name: "Test Company",
  bsale_access_token: "test-token",
  sync_status: "pending",
  last_sync_at: null,
  stripe_customer_id: null,
  is_paid: false,
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

  describe("findByStripeCustomerId", () => {
    test("returns tenant when found", async () => {
      const { db, mocks } = createMockDb();
      const paidTenant = { ...mockTenant, stripe_customer_id: "cus_123", is_paid: true };
      mocks.queryOne.mockResolvedValue(paidTenant);

      const repo = new TenantRepository(db);
      const result = await repo.findByStripeCustomerId("cus_123");

      expect(result).toEqual(paidTenant);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when tenant not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new TenantRepository(db);
      const result = await repo.findByStripeCustomerId("cus_nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateStripeCustomer", () => {
    test("updates stripe customer id and sets is_paid to true", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);

      await repo.updateStripeCustomer(mockTenant.id, "cus_123");

      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("updatePaidStatus", () => {
    test("updates is_paid status by stripe customer id", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);

      await repo.updatePaidStatus("cus_123", false);

      expect(mocks.execute).toHaveBeenCalled();
    });

    test("can set is_paid to true", async () => {
      const { db, mocks } = createMockDb();
      const repo = new TenantRepository(db);

      await repo.updatePaidStatus("cus_123", true);

      expect(mocks.execute).toHaveBeenCalled();
    });
  });
});
