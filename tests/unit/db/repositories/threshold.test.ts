import { test, expect, describe, mock, type Mock } from "bun:test";
import { ThresholdRepository } from "@/db/repositories/threshold";
import type { DatabaseClient } from "@/db/client";
import type { Threshold } from "@/db/repositories/types";

const mockThreshold: Threshold = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  tenant_id: "tenant-123",
  user_id: "user-456",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  min_quantity: 10,
  days_warning: 7,
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

describe("ThresholdRepository", () => {
  describe("getByTenant", () => {
    test("returns thresholds for tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockThreshold]);

      const repo = new ThresholdRepository(db);
      const result = await repo.getByTenant("tenant-123");

      expect(result).toEqual([mockThreshold]);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("getByUser", () => {
    test("returns thresholds for user", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockThreshold]);

      const repo = new ThresholdRepository(db);
      const result = await repo.getByUser("user-456");

      expect(result).toEqual([mockThreshold]);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("getByUserPaginated", () => {
    test("returns paginated thresholds with metadata", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockThreshold]);
      mocks.queryOne.mockResolvedValue({ count: "25" });

      const repo = new ThresholdRepository(db);
      const result = await repo.getByUserPaginated("user-456", { limit: 10, offset: 0 });

      expect(result.data).toEqual([mockThreshold]);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
    });

    test("calculates correct page from offset", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockThreshold]);
      mocks.queryOne.mockResolvedValue({ count: "50" });

      const repo = new ThresholdRepository(db);
      const result = await repo.getByUserPaginated("user-456", { limit: 20, offset: 40 });

      expect(result.pagination.page).toBe(3);
      expect(result.pagination.totalPages).toBe(3);
    });

    test("handles zero results", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);
      mocks.queryOne.mockResolvedValue({ count: "0" });

      const repo = new ThresholdRepository(db);
      const result = await repo.getByUserPaginated("user-456", { limit: 10, offset: 0 });

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe("getByVariant", () => {
    test("returns thresholds for variant with office", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockThreshold]);

      const repo = new ThresholdRepository(db);
      const result = await repo.getByVariant("tenant-123", 100, 1);

      expect(result).toEqual([mockThreshold]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns thresholds for variant without office", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockThreshold]);

      const repo = new ThresholdRepository(db);
      const result = await repo.getByVariant("tenant-123", 100, null);

      expect(result).toEqual([mockThreshold]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("includes default thresholds in results", async () => {
      const { db, mocks } = createMockDb();
      const defaultThreshold = { ...mockThreshold, bsale_variant_id: null };
      mocks.query.mockResolvedValue([mockThreshold, defaultThreshold]);

      const repo = new ThresholdRepository(db);
      const result = await repo.getByVariant("tenant-123", 100, 1);

      expect(result).toHaveLength(2);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("getDefaultThreshold", () => {
    test("returns default threshold for user", async () => {
      const { db, mocks } = createMockDb();
      const defaultThreshold: Threshold = {
        ...mockThreshold,
        bsale_variant_id: null,
        bsale_office_id: null,
      };
      mocks.queryOne.mockResolvedValue(defaultThreshold);

      const repo = new ThresholdRepository(db);
      const result = await repo.getDefaultThreshold("user-456");

      expect(result).toEqual(defaultThreshold);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when no default threshold exists", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new ThresholdRepository(db);
      const result = await repo.getDefaultThreshold("user-456");

      expect(result).toBeNull();
    });
  });

  describe("cross-tenant queries", () => {
    test("countByUserAcrossTenants counts thresholds across all tenants", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ count: "25" });

      const repo = new ThresholdRepository(db);
      const count = await repo.countByUserAcrossTenants("user-1");

      expect(count).toBe(25);
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("user_id = $1"),
        ["user-1"]
      );
    });

    test("getActiveThresholdsForUser returns first N thresholds ordered by created_at", async () => {
      const mockThresholds = [
        { ...mockThreshold, id: "t1", created_at: new Date("2026-01-01") },
        { ...mockThreshold, id: "t2", created_at: new Date("2026-01-02") },
      ];
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue(mockThresholds);

      const repo = new ThresholdRepository(db);
      const result = await repo.getActiveThresholdsForUser("user-1", 50);

      expect(result).toEqual(mockThresholds);
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY created_at ASC"),
        expect.arrayContaining(["user-1", 50])
      );
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $2"),
        expect.arrayContaining(["user-1", 50])
      );
    });

    test("getActiveThresholdsForUser returns all when limit is undefined", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new ThresholdRepository(db);
      await repo.getActiveThresholdsForUser("user-1", undefined);

      expect(mocks.query).toHaveBeenCalledWith(
        expect.not.stringContaining("LIMIT"),
        ["user-1"]
      );
    });

    test("getSkippedThresholdsForUser returns thresholds after offset", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([{ ...mockThreshold, id: "t51" }]);

      const repo = new ThresholdRepository(db);
      const result = await repo.getSkippedThresholdsForUser("user-1", 50);

      expect(result).toHaveLength(1);
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining("OFFSET $2"),
        ["user-1", 50]
      );
    });
  });
});
