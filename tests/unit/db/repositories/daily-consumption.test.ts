/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, mock, type Mock } from "bun:test";
import {
  createDailyConsumptionRepository,
  type DailyConsumption,
  type UpsertConsumptionInput,
} from "@/db/repositories/daily-consumption";
import type { DatabaseClient } from "@/db/client";

const mockConsumption: DailyConsumption = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  tenantId: "tenant-123",
  bsaleVariantId: 100,
  bsaleOfficeId: 1,
  consumptionDate: new Date("2024-01-15"),
  quantitySold: 25,
  documentCount: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockConsumptionRow = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  tenant_id: "tenant-123",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  consumption_date: new Date("2024-01-15"),
  quantity_sold: 25,
  document_count: 5,
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

describe("DailyConsumptionRepository", () => {
  describe("upsert", () => {
    test("upserts a consumption record and returns mapped result", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockConsumptionRow);

      const repo = createDailyConsumptionRepository(db);
      const input: UpsertConsumptionInput = {
        tenantId: "tenant-123",
        bsaleVariantId: 100,
        bsaleOfficeId: 1,
        consumptionDate: new Date("2024-01-15"),
        quantitySold: 25,
        documentCount: 5,
      };

      const result = await repo.upsert(input);

      expect(result).toEqual(mockConsumption);
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO daily_consumption"),
        expect.arrayContaining(["tenant-123", 100, 1])
      );
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT"),
        expect.any(Array)
      );
    });

    test("handles null office_id", async () => {
      const { db, mocks } = createMockDb();
      const rowWithNullOffice = { ...mockConsumptionRow, bsale_office_id: null };
      mocks.queryOne.mockResolvedValue(rowWithNullOffice);

      const repo = createDailyConsumptionRepository(db);
      const input: UpsertConsumptionInput = {
        tenantId: "tenant-123",
        bsaleVariantId: 100,
        bsaleOfficeId: null,
        consumptionDate: new Date("2024-01-15"),
        quantitySold: 25,
        documentCount: 5,
      };

      const result = await repo.upsert(input);

      expect(result.bsaleOfficeId).toBeNull();
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    test("throws error when upsert fails", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = createDailyConsumptionRepository(db);
      const input: UpsertConsumptionInput = {
        tenantId: "tenant-123",
        bsaleVariantId: 100,
        consumptionDate: new Date("2024-01-15"),
        quantitySold: 25,
        documentCount: 5,
      };

      await expect(repo.upsert(input)).rejects.toThrow(
        "Failed to upsert daily consumption"
      );
    });
  });

  describe("upsertBatch", () => {
    test("returns 0 for empty array", async () => {
      const { db, mocks } = createMockDb();
      const repo = createDailyConsumptionRepository(db);

      const result = await repo.upsertBatch([]);

      expect(result).toBe(0);
      expect(mocks.execute).not.toHaveBeenCalled();
    });

    test("inserts batch of consumption records", async () => {
      const { db, mocks } = createMockDb();
      const repo = createDailyConsumptionRepository(db);

      const inputs: UpsertConsumptionInput[] = [
        {
          tenantId: "tenant-123",
          bsaleVariantId: 100,
          bsaleOfficeId: 1,
          consumptionDate: new Date("2024-01-15"),
          quantitySold: 25,
          documentCount: 5,
        },
      ];

      const result = await repo.upsertBatch(inputs);

      expect(result).toBe(1);
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO daily_consumption"),
        expect.any(Array)
      );
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT"),
        expect.any(Array)
      );
    });

    test("handles multiple records in batch", async () => {
      const { db, mocks } = createMockDb();
      const repo = createDailyConsumptionRepository(db);

      const inputs: UpsertConsumptionInput[] = [
        {
          tenantId: "tenant-123",
          bsaleVariantId: 100,
          bsaleOfficeId: 1,
          consumptionDate: new Date("2024-01-15"),
          quantitySold: 25,
          documentCount: 5,
        },
        {
          tenantId: "tenant-123",
          bsaleVariantId: 200,
          bsaleOfficeId: null,
          consumptionDate: new Date("2024-01-15"),
          quantitySold: 10,
          documentCount: 2,
        },
      ];

      const result = await repo.upsertBatch(inputs);

      expect(result).toBe(2);
      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("getByVariantAndDate", () => {
    test("returns consumption for variant with office on specific date", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockConsumptionRow);

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.getByVariantAndDate(
        "tenant-123",
        100,
        1,
        new Date("2024-01-15")
      );

      expect(result).toEqual(mockConsumption);
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("IS NOT DISTINCT FROM"),
        expect.arrayContaining(["tenant-123", 100, 1])
      );
    });

    test("returns consumption for variant without office", async () => {
      const { db, mocks } = createMockDb();
      const rowWithNullOffice = { ...mockConsumptionRow, bsale_office_id: null };
      mocks.queryOne.mockResolvedValue(rowWithNullOffice);

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.getByVariantAndDate(
        "tenant-123",
        100,
        null,
        new Date("2024-01-15")
      );

      expect(result?.bsaleOfficeId).toBeNull();
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("IS NOT DISTINCT FROM"),
        expect.arrayContaining([null])
      );
    });

    test("returns null when no record found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.getByVariantAndDate(
        "tenant-123",
        100,
        1,
        new Date("2024-01-15")
      );

      expect(result).toBeNull();
    });
  });

  describe("get7DayAverage", () => {
    test("returns average consumption for variant with office", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ avg: "15.5" });

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.get7DayAverage("tenant-123", 100, 1);

      expect(result).toBe(15.5);
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("AVG(quantity_sold)"),
        expect.arrayContaining(["tenant-123", 100, 1])
      );
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("7 days"),
        expect.any(Array)
      );
    });

    test("returns average consumption for variant without office", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ avg: "10.0" });

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.get7DayAverage("tenant-123", 100, null);

      expect(result).toBe(10.0);
      expect(mocks.queryOne).toHaveBeenCalledWith(
        expect.stringContaining("IS NOT DISTINCT FROM"),
        expect.arrayContaining([null])
      );
    });

    test("returns 0 when no consumption data exists", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({ avg: null });

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.get7DayAverage("tenant-123", 100, 1);

      expect(result).toBe(0);
    });

    test("returns 0 when query returns null", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.get7DayAverage("tenant-123", 100, 1);

      expect(result).toBe(0);
    });
  });

  describe("getConsumptionHistory", () => {
    test("returns consumption history for variant with office", async () => {
      const { db, mocks } = createMockDb();
      const historicalRows = [
        { ...mockConsumptionRow, consumption_date: new Date("2024-01-15") },
        { ...mockConsumptionRow, consumption_date: new Date("2024-01-14") },
        { ...mockConsumptionRow, consumption_date: new Date("2024-01-13") },
      ];
      mocks.query.mockResolvedValue(historicalRows);

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.getConsumptionHistory("tenant-123", 100, 1, 7);

      expect(result).toHaveLength(3);
      expect(result[0]?.tenantId).toBe("tenant-123");
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY consumption_date DESC"),
        expect.arrayContaining(["tenant-123", 100, 1, 7])
      );
    });

    test("returns consumption history for variant without office", async () => {
      const { db, mocks } = createMockDb();
      const rowWithNullOffice = [{ ...mockConsumptionRow, bsale_office_id: null }];
      mocks.query.mockResolvedValue(rowWithNullOffice);

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.getConsumptionHistory("tenant-123", 100, null, 7);

      expect(result).toHaveLength(1);
      expect(result[0]?.bsaleOfficeId).toBeNull();
    });

    test("returns empty array when no history exists", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = createDailyConsumptionRepository(db);
      const result = await repo.getConsumptionHistory("tenant-123", 100, 1, 7);

      expect(result).toEqual([]);
    });

    test("respects days parameter", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = createDailyConsumptionRepository(db);
      await repo.getConsumptionHistory("tenant-123", 100, 1, 30);

      expect(mocks.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([30])
      );
    });
  });
});
