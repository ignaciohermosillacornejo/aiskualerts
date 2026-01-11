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
});
