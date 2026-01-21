import { test, expect, describe, mock, type Mock } from "bun:test";
import { AlertRepository } from "@/db/repositories/alert";
import type { DatabaseClient } from "@/db/client";
import type { Alert, AlertInput } from "@/db/repositories/types";

const mockAlert: Alert = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  tenant_id: "tenant-123",
  user_id: "user-456",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  sku: "SKU-001",
  product_name: "Test Product",
  alert_type: "low_stock",
  current_quantity: 5,
  threshold_quantity: 10,
  days_to_stockout: null,
  status: "pending",
  sent_at: null,
  dismissed_by: null,
  created_at: new Date(),
};

const mockAlertInput: AlertInput = {
  tenant_id: "tenant-123",
  user_id: "user-456",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  sku: "SKU-001",
  product_name: "Test Product",
  alert_type: "low_stock",
  current_quantity: 5,
  threshold_quantity: 10,
  days_to_stockout: null,
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

describe("AlertRepository", () => {
  describe("create", () => {
    test("creates alert and returns it", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockAlert);

      const repo = new AlertRepository(db);
      const result = await repo.create(mockAlertInput);

      expect(result).toEqual(mockAlert);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("throws error when creation fails", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new AlertRepository(db);

      let error: Error | null = null;
      try {
        await repo.create(mockAlertInput);
      } catch (e) {
        error = e as Error;
      }
      expect(error).not.toBeNull();
      expect(error?.message).toBe("Failed to create alert");
    });
  });

  describe("createBatch", () => {
    test("returns 0 for empty array", async () => {
      const { db, mocks } = createMockDb();
      const repo = new AlertRepository(db);

      const result = await repo.createBatch([]);

      expect(result).toBe(0);
      expect(mocks.execute).not.toHaveBeenCalled();
    });

    test("inserts batch of alerts", async () => {
      const { db, mocks } = createMockDb();
      const repo = new AlertRepository(db);

      const result = await repo.createBatch([mockAlertInput]);

      expect(result).toBe(1);
      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("getPendingByUser", () => {
    test("returns pending alerts for user", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockAlert]);

      const repo = new AlertRepository(db);
      const result = await repo.getPendingByUser("user-456");

      expect(result).toEqual([mockAlert]);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("getPendingByTenant", () => {
    test("returns pending alerts for tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockAlert]);

      const repo = new AlertRepository(db);
      const result = await repo.getPendingByTenant("tenant-123");

      expect(result).toEqual([mockAlert]);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("getPendingByTenants", () => {
    test("returns empty array for empty tenant ids", async () => {
      const { db, mocks } = createMockDb();

      const repo = new AlertRepository(db);
      const result = await repo.getPendingByTenants([]);

      expect(result).toEqual([]);
      expect(mocks.query).not.toHaveBeenCalled();
    });

    test("returns pending alerts from multiple tenants", async () => {
      const { db, mocks } = createMockDb();
      const alert1 = { ...mockAlert, tenant_id: "tenant-1" };
      const alert2 = { ...mockAlert, id: "alert-456", tenant_id: "tenant-2" };
      mocks.query.mockResolvedValue([alert1, alert2]);

      const repo = new AlertRepository(db);
      const result = await repo.getPendingByTenants(["tenant-1", "tenant-2"]);

      expect(result).toEqual([alert1, alert2]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("handles single tenant in batch", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockAlert]);

      const repo = new AlertRepository(db);
      const result = await repo.getPendingByTenants(["tenant-123"]);

      expect(result).toEqual([mockAlert]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no pending alerts exist", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new AlertRepository(db);
      const result = await repo.getPendingByTenants(["tenant-1", "tenant-2"]);

      expect(result).toEqual([]);
    });
  });

  describe("markAsSent", () => {
    test("does nothing for empty array", async () => {
      const { db, mocks } = createMockDb();
      const repo = new AlertRepository(db);

      await repo.markAsSent([]);

      expect(mocks.execute).not.toHaveBeenCalled();
    });

    test("updates status to sent", async () => {
      const { db, mocks } = createMockDb();
      const repo = new AlertRepository(db);

      await repo.markAsSent(["alert-1", "alert-2"]);

      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("markAsDismissed", () => {
    test("updates status to dismissed with dismisser", async () => {
      const { db, mocks } = createMockDb();
      const repo = new AlertRepository(db);

      await repo.markAsDismissed("alert-1", "user-123");

      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("hasPendingAlert", () => {
    test("returns true when pending alert exists", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ exists: true });

      const repo = new AlertRepository(db);
      const result = await repo.hasPendingAlert(
        "user-456",
        100,
        1,
        "low_stock"
      );

      expect(result).toBe(true);
    });

    test("returns false when no pending alert exists", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ exists: false });

      const repo = new AlertRepository(db);
      const result = await repo.hasPendingAlert(
        "user-456",
        100,
        1,
        "low_stock"
      );

      expect(result).toBe(false);
    });

    test("handles null office id", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ exists: true });

      const repo = new AlertRepository(db);
      const result = await repo.hasPendingAlert(
        "user-456",
        100,
        null,
        "low_velocity"
      );

      expect(result).toBe(true);
      expect(mocks.queryOne).toHaveBeenCalled();
    });
  });

  describe("hasPendingAlertForTenant", () => {
    test("returns true when pending alert exists for tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ exists: true });

      const repo = new AlertRepository(db);
      const result = await repo.hasPendingAlertForTenant(
        "tenant-123",
        100,
        1,
        "low_stock"
      );

      expect(result).toBe(true);
    });

    test("returns false when no pending alert exists for tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ exists: false });

      const repo = new AlertRepository(db);
      const result = await repo.hasPendingAlertForTenant(
        "tenant-123",
        100,
        1,
        "low_stock"
      );

      expect(result).toBe(false);
    });
  });

  describe("findByTenantWithFilter", () => {
    test("returns alerts filtered by tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockAlert]);
      mocks.queryOne.mockResolvedValue({ count: "1" });

      const repo = new AlertRepository(db);
      const result = await repo.findByTenantWithFilter("tenant-123");

      expect(result.alerts).toEqual([mockAlert]);
      expect(result.total).toBe(1);
    });

    test("filters by type and status", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockAlert]);
      mocks.queryOne.mockResolvedValue({ count: "5" });

      const repo = new AlertRepository(db);
      const result = await repo.findByTenantWithFilter("tenant-123", {
        type: "low_stock",
        status: "pending",
        limit: 10,
      });

      expect(result.alerts).toEqual([mockAlert]);
      expect(result.total).toBe(5);
    });
  });

  describe("countPendingByTenant", () => {
    test("returns count of pending alerts for tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ count: "15" });

      const repo = new AlertRepository(db);
      const count = await repo.countPendingByTenant("tenant-123");

      expect(count).toBe(15);
    });

    test("returns 0 when no pending alerts", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ count: "0" });

      const repo = new AlertRepository(db);
      const count = await repo.countPendingByTenant("tenant-123");

      expect(count).toBe(0);
    });
  });
});
