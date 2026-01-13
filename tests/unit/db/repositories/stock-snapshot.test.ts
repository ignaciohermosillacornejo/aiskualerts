import { test, expect, describe, mock, type Mock } from "bun:test";
import { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { DatabaseClient } from "@/db/client";
import type { StockSnapshot, StockSnapshotInput } from "@/db/repositories/types";

const mockSnapshot: StockSnapshot = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  tenant_id: "tenant-123",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  sku: "SKU-001",
  barcode: "7890123456789",
  product_name: "Test Product",
  quantity: 50,
  quantity_reserved: 5,
  quantity_available: 45,
  snapshot_date: new Date("2024-01-15"),
  created_at: new Date(),
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

describe("StockSnapshotRepository", () => {
  describe("upsertBatch", () => {
    test("returns 0 for empty array", async () => {
      const { db, mocks } = createMockDb();
      const repo = new StockSnapshotRepository(db);

      const result = await repo.upsertBatch([]);

      expect(result).toBe(0);
      expect(mocks.execute).not.toHaveBeenCalled();
    });

    test("inserts batch of snapshots", async () => {
      const { db, mocks } = createMockDb();
      const repo = new StockSnapshotRepository(db);

      const input: StockSnapshotInput = {
        tenant_id: "tenant-123",
        bsale_variant_id: 100,
        bsale_office_id: 1,
        sku: "SKU-001",
        barcode: "7890123456789",
        product_name: "Test Product",
        quantity: 50,
        quantity_reserved: 5,
        quantity_available: 45,
        snapshot_date: new Date("2024-01-15"),
      };

      const result = await repo.upsertBatch([input]);

      expect(result).toBe(1);
      expect(mocks.execute).toHaveBeenCalled();
    });

    test("handles multiple snapshots in batch", async () => {
      const { db } = createMockDb();
      const repo = new StockSnapshotRepository(db);

      const inputs: StockSnapshotInput[] = [
        {
          tenant_id: "tenant-123",
          bsale_variant_id: 100,
          bsale_office_id: 1,
          sku: "SKU-001",
          barcode: null,
          product_name: "Product 1",
          quantity: 10,
          quantity_reserved: 0,
          quantity_available: 10,
          snapshot_date: new Date("2024-01-15"),
        },
        {
          tenant_id: "tenant-123",
          bsale_variant_id: 200,
          bsale_office_id: null,
          sku: "SKU-002",
          barcode: null,
          product_name: "Product 2",
          quantity: 20,
          quantity_reserved: 5,
          quantity_available: 15,
          snapshot_date: new Date("2024-01-15"),
        },
      ];

      const result = await repo.upsertBatch(inputs);

      expect(result).toBe(2);
    });
  });

  describe("getLatestByTenant", () => {
    test("returns latest snapshots for tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockSnapshot]);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getLatestByTenant("tenant-123");

      expect(result).toEqual([mockSnapshot]);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("getByVariant", () => {
    test("returns snapshot for variant with office", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockSnapshot);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getByVariant("tenant-123", 100, 1);

      expect(result).toEqual(mockSnapshot);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns snapshot for variant without office", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockSnapshot);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getByVariant("tenant-123", 100, null);

      expect(result).toEqual(mockSnapshot);
      expect(mocks.queryOne).toHaveBeenCalled();
    });
  });

  describe("getHistoricalSnapshots", () => {
    test("returns historical snapshots for variant with office", async () => {
      const { db, mocks } = createMockDb();
      const historicalSnapshots = [
        { ...mockSnapshot, snapshot_date: new Date("2024-01-15") },
        { ...mockSnapshot, snapshot_date: new Date("2024-01-14") },
        { ...mockSnapshot, snapshot_date: new Date("2024-01-13") },
      ];
      mocks.query.mockResolvedValue(historicalSnapshots);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getHistoricalSnapshots("tenant-123", 100, 1, 7);

      expect(result).toEqual(historicalSnapshots);
      expect(result.length).toBe(3);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns historical snapshots for variant without office", async () => {
      const { db, mocks } = createMockDb();
      const historicalSnapshots = [
        { ...mockSnapshot, bsale_office_id: null },
      ];
      mocks.query.mockResolvedValue(historicalSnapshots);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getHistoricalSnapshots("tenant-123", 100, null, 7);

      expect(result).toEqual(historicalSnapshots);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no historical data", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getHistoricalSnapshots("tenant-123", 100, 1, 7);

      expect(result).toEqual([]);
    });
  });

  describe("deleteOlderThan", () => {
    test("deletes old snapshots and returns count", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([{ count: 10 }]);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.deleteOlderThan(30);

      expect(result).toBe(10);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns 0 when no rows deleted", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.deleteOlderThan(30);

      expect(result).toBe(0);
    });
  });

  describe("getById", () => {
    test("returns snapshot when found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockSnapshot);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getById("123e4567-e89b-12d3-a456-426614174000");

      expect(result).toEqual(mockSnapshot);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new StockSnapshotRepository(db);
      const result = await repo.getById("non-existent-id");

      expect(result).toBeNull();
      expect(mocks.queryOne).toHaveBeenCalled();
    });
  });
});
