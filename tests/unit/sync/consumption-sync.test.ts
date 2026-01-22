import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createConsumptionSyncService } from "@/sync/consumption-sync";
import type { BsaleDocument } from "@/bsale/types";
import type { UpsertConsumptionInput } from "@/db/repositories/daily-consumption";

// Helper to create a mock BsaleDocument
function createMockDocument(
  id: number,
  emissionDate: number,
  details: { variantId: number; quantity: number; code?: string }[]
): BsaleDocument {
  return {
    id,
    emissionDate,
    state: 0,
    details: {
      items: details.map((d, idx) => ({
        id: id * 100 + idx,
        quantity: d.quantity,
        variant: {
          id: d.variantId,
          code: d.code ?? `SKU-${String(d.variantId)}`,
        },
      })),
    },
  };
}

// Convert date string to Unix timestamp (seconds)
function toUnixTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

describe("createConsumptionSyncService", () => {
  let mockGetAllDocuments: ReturnType<typeof mock<(options: unknown) => Promise<BsaleDocument[]>>>;
  let mockUpsertBatch: ReturnType<typeof mock<(inputs: UpsertConsumptionInput[]) => Promise<number>>>;

  beforeEach(() => {
    mockGetAllDocuments = mock<(options: unknown) => Promise<BsaleDocument[]>>(() => Promise.resolve([]));
    mockUpsertBatch = mock<(inputs: UpsertConsumptionInput[]) => Promise<number>>(() => Promise.resolve(0));
  });

  function createService() {
    return createConsumptionSyncService({
      bsaleClient: {
        getAllDocuments: mockGetAllDocuments,
      },
      consumptionRepo: {
        upsertBatch: mockUpsertBatch,
      },
    });
  }

  describe("syncConsumption", () => {
    test("aggregates document details into daily consumption - same variant on same day should sum quantities", async () => {
      const service = createService();
      const tenantId = "tenant-123";
      const dateTimestamp = toUnixTimestamp("2024-01-15T12:00:00Z");

      // Two documents on the same day with the same variant
      mockGetAllDocuments.mockResolvedValue([
        createMockDocument(1, dateTimestamp, [{ variantId: 100, quantity: 5 }]),
        createMockDocument(2, dateTimestamp, [{ variantId: 100, quantity: 3 }]),
      ]);

      const result = await service.syncConsumption(tenantId, 7);

      expect(result.documentsProcessed).toBe(2);
      expect(result.variantsUpdated).toBe(1); // Same variant, same day = 1 entry

      // Verify upsertBatch was called with summed quantity
      expect(mockUpsertBatch).toHaveBeenCalledTimes(1);
      const upsertInput = mockUpsertBatch.mock.calls[0]?.[0];
      expect(upsertInput).toHaveLength(1);
      expect(upsertInput?.[0]?.bsaleVariantId).toBe(100);
      expect(upsertInput?.[0]?.quantitySold).toBe(8); // 5 + 3
      expect(upsertInput?.[0]?.documentCount).toBe(2);
    });

    test("handles multiple documents with multiple variants", async () => {
      const service = createService();
      const tenantId = "tenant-123";
      const day1 = toUnixTimestamp("2024-01-15T10:00:00Z");
      const day2 = toUnixTimestamp("2024-01-16T14:00:00Z");

      mockGetAllDocuments.mockResolvedValue([
        createMockDocument(1, day1, [
          { variantId: 100, quantity: 2 },
          { variantId: 200, quantity: 3 },
        ]),
        createMockDocument(2, day1, [{ variantId: 100, quantity: 1 }]),
        createMockDocument(3, day2, [{ variantId: 100, quantity: 4 }]),
        createMockDocument(4, day2, [{ variantId: 300, quantity: 6 }]),
      ]);

      const result = await service.syncConsumption(tenantId, 7);

      expect(result.documentsProcessed).toBe(4);
      // 3 unique variant+date combinations:
      // - variant 100 on day1 (2+1=3)
      // - variant 200 on day1 (3)
      // - variant 100 on day2 (4)
      // - variant 300 on day2 (6)
      expect(result.variantsUpdated).toBe(4);

      expect(mockUpsertBatch).toHaveBeenCalledTimes(1);
      const upsertInput = mockUpsertBatch.mock.calls[0]?.[0];
      expect(upsertInput).toHaveLength(4);

      // Check variant 100 on day 1 (should be aggregated)
      const variant100Day1 = upsertInput?.find(
        (i) => i.bsaleVariantId === 100 && i.consumptionDate.toISOString().startsWith("2024-01-15")
      );
      expect(variant100Day1?.quantitySold).toBe(3); // 2 + 1
      expect(variant100Day1?.documentCount).toBe(2);

      // Check variant 200 on day 1
      const variant200Day1 = upsertInput?.find(
        (i) => i.bsaleVariantId === 200 && i.consumptionDate.toISOString().startsWith("2024-01-15")
      );
      expect(variant200Day1?.quantitySold).toBe(3);
      expect(variant200Day1?.documentCount).toBe(1);

      // Check variant 100 on day 2 (separate from day 1)
      const variant100Day2 = upsertInput?.find(
        (i) => i.bsaleVariantId === 100 && i.consumptionDate.toISOString().startsWith("2024-01-16")
      );
      expect(variant100Day2?.quantitySold).toBe(4);
      expect(variant100Day2?.documentCount).toBe(1);
    });

    test("handles empty documents - no details", async () => {
      const service = createService();
      const tenantId = "tenant-123";
      const dateTimestamp = toUnixTimestamp("2024-01-15T12:00:00Z");

      // Document with empty details
      mockGetAllDocuments.mockResolvedValue([
        {
          id: 1,
          emissionDate: dateTimestamp,
          state: 0,
          details: { items: [] },
        },
      ]);

      const result = await service.syncConsumption(tenantId, 7);

      expect(result.documentsProcessed).toBe(1);
      expect(result.variantsUpdated).toBe(0);

      // upsertBatch should NOT be called when there are no consumption records
      expect(mockUpsertBatch).not.toHaveBeenCalled();
    });

    test("handles no documents returned", async () => {
      const service = createService();
      const tenantId = "tenant-123";

      mockGetAllDocuments.mockResolvedValue([]);

      const result = await service.syncConsumption(tenantId, 7);

      expect(result.documentsProcessed).toBe(0);
      expect(result.variantsUpdated).toBe(0);
      expect(result.daysProcessed).toBe(7);

      // upsertBatch should NOT be called when there are no consumption records
      expect(mockUpsertBatch).not.toHaveBeenCalled();
    });

    test("correctly calculates document count per variant per day", async () => {
      const service = createService();
      const tenantId = "tenant-123";
      const dateTimestamp = toUnixTimestamp("2024-01-15T12:00:00Z");

      // Three documents, all same day, same variant
      mockGetAllDocuments.mockResolvedValue([
        createMockDocument(1, dateTimestamp, [{ variantId: 500, quantity: 1 }]),
        createMockDocument(2, dateTimestamp, [{ variantId: 500, quantity: 2 }]),
        createMockDocument(3, dateTimestamp, [{ variantId: 500, quantity: 3 }]),
      ]);

      const result = await service.syncConsumption(tenantId, 7);

      expect(result.documentsProcessed).toBe(3);
      expect(result.variantsUpdated).toBe(1);

      expect(mockUpsertBatch).toHaveBeenCalledTimes(1);
      const upsertInput = mockUpsertBatch.mock.calls[0]?.[0];
      expect(upsertInput).toHaveLength(1);
      expect(upsertInput?.[0]?.documentCount).toBe(3);
      expect(upsertInput?.[0]?.quantitySold).toBe(6); // 1 + 2 + 3
    });

    test("calls upsertBatch with correctly aggregated data", async () => {
      const service = createService();
      const tenantId = "tenant-abc";
      const dateTimestamp = toUnixTimestamp("2024-02-20T08:30:00Z");

      mockGetAllDocuments.mockResolvedValue([
        createMockDocument(1, dateTimestamp, [{ variantId: 999, quantity: 10 }]),
      ]);

      await service.syncConsumption(tenantId, 14);

      expect(mockUpsertBatch).toHaveBeenCalledTimes(1);
      const upsertInput = mockUpsertBatch.mock.calls[0]?.[0];

      expect(upsertInput).toHaveLength(1);
      const record = upsertInput?.[0];
      expect(record?.tenantId).toBe("tenant-abc");
      expect(record?.bsaleVariantId).toBe(999);
      expect(record?.bsaleOfficeId).toBeNull();
      expect(record?.quantitySold).toBe(10);
      expect(record?.documentCount).toBe(1);
      // Date should be 2024-02-20
      expect(record?.consumptionDate.toISOString().startsWith("2024-02-20")).toBe(true);
    });

    test("returns correct result metrics", async () => {
      const service = createService();
      const tenantId = "tenant-456";
      const day1 = toUnixTimestamp("2024-01-10T00:00:00Z");
      const day2 = toUnixTimestamp("2024-01-11T00:00:00Z");
      const day3 = toUnixTimestamp("2024-01-12T00:00:00Z");

      mockGetAllDocuments.mockResolvedValue([
        createMockDocument(1, day1, [{ variantId: 1, quantity: 5 }]),
        createMockDocument(2, day2, [{ variantId: 1, quantity: 3 }]),
        createMockDocument(3, day2, [{ variantId: 2, quantity: 7 }]),
        createMockDocument(4, day3, [{ variantId: 3, quantity: 2 }]),
        createMockDocument(5, day3, [{ variantId: 3, quantity: 1 }]),
      ]);

      const result = await service.syncConsumption(tenantId, 10);

      expect(result.daysProcessed).toBe(10);
      expect(result.documentsProcessed).toBe(5);
      // Unique variant+date combinations:
      // - variant 1 day1
      // - variant 1 day2
      // - variant 2 day2
      // - variant 3 day3
      expect(result.variantsUpdated).toBe(4);
    });

    test("passes correct parameters to getAllDocuments", async () => {
      const service = createService();
      const tenantId = "tenant-xyz";

      mockGetAllDocuments.mockResolvedValue([]);

      // Use a fixed current date for testing
      const before = new Date();
      await service.syncConsumption(tenantId, 7);
      const after = new Date();

      expect(mockGetAllDocuments).toHaveBeenCalledTimes(1);
      const callArgs = mockGetAllDocuments.mock.calls[0]?.[0] as {
        startDate: Date;
        endDate: Date;
        expand: string[];
        state: number;
      };

      expect(callArgs.expand).toEqual(["details"]);
      expect(callArgs.state).toBe(0);

      // End date should be approximately now
      expect(callArgs.endDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(callArgs.endDate.getTime()).toBeLessThanOrEqual(after.getTime());

      // Start date should be approximately 7 days ago
      const expectedStartDate = new Date(before);
      expectedStartDate.setDate(expectedStartDate.getDate() - 7);
      const marginMs = 1000; // 1 second margin
      expect(callArgs.startDate.getTime()).toBeGreaterThanOrEqual(expectedStartDate.getTime() - marginMs);
      expect(callArgs.startDate.getTime()).toBeLessThanOrEqual(expectedStartDate.getTime() + marginMs);
    });

    test("uses default days value of 7 when not specified", async () => {
      const service = createService();
      const tenantId = "tenant-default";

      mockGetAllDocuments.mockResolvedValue([]);

      const result = await service.syncConsumption(tenantId);

      expect(result.daysProcessed).toBe(7);
    });

    test("handles documents with missing details.items gracefully", async () => {
      const service = createService();
      const tenantId = "tenant-123";
      const dateTimestamp = toUnixTimestamp("2024-01-15T12:00:00Z");

      // Document where details might be undefined or have undefined items
      const docWithPartialDetails = {
        id: 1,
        emissionDate: dateTimestamp,
        state: 0,
        details: { items: [] as { id: number; quantity: number; variant: { id: number; code: string | null } }[] },
      };

      mockGetAllDocuments.mockResolvedValue([docWithPartialDetails]);

      const result = await service.syncConsumption(tenantId, 7);

      expect(result.documentsProcessed).toBe(1);
      expect(result.variantsUpdated).toBe(0);
      expect(mockUpsertBatch).not.toHaveBeenCalled();
    });
  });
});
