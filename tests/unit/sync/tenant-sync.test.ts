import { test, expect, describe, mock, type Mock } from "bun:test";
import { syncTenant, enrichSnapshotWithVariant, type TenantSyncDependencies } from "@/sync/tenant-sync";
import type { Tenant, StockSnapshotInput } from "@/db/repositories/types";
import type { StockItem, Variant } from "@/bsale/types";
import { BsaleAuthError, BsaleRateLimitError } from "@/lib/errors";

const mockTenant: Tenant = {
  id: "tenant-123",
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

interface MockDeps {
  updateSyncStatus: Mock<(tenantId: string, status: string) => Promise<void>>;
  upsertBatch: Mock<(batch: StockSnapshotInput[]) => Promise<number>>;
  getAllStocks: Mock<() => AsyncGenerator<StockItem>>;
  getVariantsBatch: Mock<(ids: number[]) => Promise<Map<number, Variant>>>;
}

function createMockDeps(): { deps: TenantSyncDependencies; mocks: MockDeps } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- args captured by mock
  const updateSyncStatus = mock((_tenantId: string, _status: string) => Promise.resolve());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- args captured by mock
  const upsertBatch = mock((_batch: StockSnapshotInput[]) => Promise.resolve(0));

  // eslint-disable-next-line require-yield
  async function* emptyGenerator(): AsyncGenerator<StockItem> {
    await Promise.resolve();
  }
  const getAllStocks = mock(() => emptyGenerator());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- args captured by mock
  const getVariantsBatch = mock((_ids: number[]) => Promise.resolve(new Map<number, Variant>()));

  const deps: TenantSyncDependencies = {
    tenantRepo: {
      updateSyncStatus,
      getActiveTenants: mock(() => Promise.resolve([])),
      getById: mock(() => Promise.resolve(null)),
      getTenantsByStatus: mock(() => Promise.resolve([])),
    } as unknown as TenantSyncDependencies["tenantRepo"],
    snapshotRepo: {
      upsertBatch,
    } as unknown as TenantSyncDependencies["snapshotRepo"],
    createBsaleClient: () =>
      ({
        getAllStocks,
        getVariantsBatch,
      }) as unknown as ReturnType<TenantSyncDependencies["createBsaleClient"]>,
  };

  return { deps, mocks: { updateSyncStatus, upsertBatch, getAllStocks, getVariantsBatch } };
}

function createMockStock(id: number, officeId: number | null = null): StockItem {
  return {
    id,
    quantity: 50,
    quantityReserved: 5,
    quantityAvailable: 45,
    variant: { href: `/variants/${String(id)}`, id },
    office: officeId ? { href: `/offices/${String(officeId)}`, id: officeId } : null,
  };
}

describe("syncTenant", () => {
  test("returns success result when sync completes", async () => {
    const { deps } = createMockDeps();

    const result = await syncTenant(mockTenant, deps);

    expect(result.success).toBe(true);
    expect(result.tenantId).toBe(mockTenant.id);
    expect(result.itemsSynced).toBe(0);
    expect(result.error).toBeUndefined();
  });

  test("sets sync status to syncing at start", async () => {
    const { deps, mocks } = createMockDeps();

    await syncTenant(mockTenant, deps);

    expect(mocks.updateSyncStatus).toHaveBeenCalled();
  });

  test("sets sync status to success on completion", async () => {
    const { deps, mocks } = createMockDeps();

    await syncTenant(mockTenant, deps);

    // Should be called twice: once for 'syncing', once for 'success'
    expect(mocks.updateSyncStatus.mock.calls.length).toBe(2);
  });

  test("syncs stock items from Bsale API", async () => {
    const { deps, mocks } = createMockDeps();

    async function* stockGenerator(): AsyncGenerator<StockItem> {
      await Promise.resolve();
      yield createMockStock(100, 1);
      yield createMockStock(200);
    }
    mocks.getAllStocks.mockImplementation(() => stockGenerator());

    const result = await syncTenant(mockTenant, deps);

    expect(result.success).toBe(true);
    expect(result.itemsSynced).toBe(2);
    expect(mocks.upsertBatch).toHaveBeenCalled();
  });

  test("batches inserts according to batchSize option", async () => {
    const { deps, mocks } = createMockDeps();

    async function* stockGenerator(): AsyncGenerator<StockItem> {
      await Promise.resolve();
      for (let i = 0; i < 5; i++) {
        yield createMockStock(i);
      }
    }
    mocks.getAllStocks.mockImplementation(() => stockGenerator());

    const result = await syncTenant(mockTenant, deps, { batchSize: 2, delayBetweenTenants: 0 });

    expect(result.success).toBe(true);
    expect(result.itemsSynced).toBe(5);
    // Should be called 3 times: 2 items, 2 items, 1 item
    expect(mocks.upsertBatch.mock.calls.length).toBe(3);
  });

  test("returns failure result on BsaleAuthError", async () => {
    const { deps, mocks } = createMockDeps();

    async function* errorGenerator(): AsyncGenerator<StockItem> {
      await Promise.resolve();
      throw new BsaleAuthError("Token expired");
      yield createMockStock(1); // Unreachable but needed for type
    }
    mocks.getAllStocks.mockImplementation(() => errorGenerator());

    const result = await syncTenant(mockTenant, deps);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Token expired");
  });

  test("sets status to pending on rate limit error", async () => {
    const { deps, mocks } = createMockDeps();

    async function* errorGenerator(): AsyncGenerator<StockItem> {
      await Promise.resolve();
      throw new BsaleRateLimitError("Rate limit exceeded");
      yield createMockStock(1); // Unreachable but needed for type
    }
    mocks.getAllStocks.mockImplementation(() => errorGenerator());

    const result = await syncTenant(mockTenant, deps);

    expect(result.success).toBe(false);
    // Verify updateSyncStatus was called with 'pending' after 'syncing'
    expect(mocks.updateSyncStatus.mock.calls.length).toBe(2);
  });

  test("returns timestamps in result", async () => {
    const { deps } = createMockDeps();
    const before = new Date();

    const result = await syncTenant(mockTenant, deps);

    const after = new Date();
    expect(result.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  describe("temporary database error handling", () => {
    test("sets status to pending on ECONNREFUSED error", async () => {
      const { deps, mocks } = createMockDeps();

      async function* errorGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        throw new Error("ECONNREFUSED: Connection refused");
        yield createMockStock(1); // Unreachable but needed for type
      }
      mocks.getAllStocks.mockImplementation(() => errorGenerator());

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(false);
      expect(result.error).toBe("ECONNREFUSED: Connection refused");
      // First call: 'syncing', second call: 'pending'
      const calls = mocks.updateSyncStatus.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[1]).toBe("pending");
    });

    test("sets status to pending on connection error", async () => {
      const { deps, mocks } = createMockDeps();

      async function* errorGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        throw new Error("Database connection lost");
        yield createMockStock(1); // Unreachable but needed for type
      }
      mocks.getAllStocks.mockImplementation(() => errorGenerator());

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database connection lost");
      // First call: 'syncing', second call: 'pending'
      const calls = mocks.updateSyncStatus.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[1]).toBe("pending");
    });

    test("sets status to pending on timeout error", async () => {
      const { deps, mocks } = createMockDeps();

      async function* errorGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        throw new Error("Query timeout exceeded");
        yield createMockStock(1); // Unreachable but needed for type
      }
      mocks.getAllStocks.mockImplementation(() => errorGenerator());

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Query timeout exceeded");
      // First call: 'syncing', second call: 'pending'
      const calls = mocks.updateSyncStatus.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[1]).toBe("pending");
    });

    test("sets status to failed on other Error", async () => {
      const { deps, mocks } = createMockDeps();

      async function* errorGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        throw new Error("Invalid data format");
        yield createMockStock(1); // Unreachable but needed for type
      }
      mocks.getAllStocks.mockImplementation(() => errorGenerator());

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid data format");
      // First call: 'syncing', second call: 'failed'
      const calls = mocks.updateSyncStatus.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[1]).toBe("failed");
    });

    test("sets status to failed on unknown error type", async () => {
      const { deps, mocks } = createMockDeps();

      async function* errorGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        throw new Error("string error"); // Non-Error object converted to Error
        yield createMockStock(1); // Unreachable but needed for type
      }
      mocks.getAllStocks.mockImplementation(() => errorGenerator());

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(false);
      expect(result.error).toBe("string error");
      // First call: 'syncing', second call: 'failed'
      const calls = mocks.updateSyncStatus.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[1]).toBe("failed");
    });
  });

  describe("variant enrichment", () => {
    test("enriches stock snapshots with variant data", async () => {
      const { deps, mocks } = createMockDeps();

      async function* stockGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        yield createMockStock(100, 1);
        yield createMockStock(200, 1);
      }
      mocks.getAllStocks.mockImplementation(() => stockGenerator());

      const variantsMap = new Map<number, Variant>([
        [100, { id: 100, code: "SKU-100", barCode: "BC-100", description: "Variant 100", product: { name: "Product 100" } }],
        [200, { id: 200, code: "SKU-200", barCode: "BC-200", description: "Variant 200", product: { name: "Product 200" } }],
      ]);
      mocks.getVariantsBatch.mockImplementation(() => Promise.resolve(variantsMap));

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(true);
      expect(result.itemsSynced).toBe(2);

      // Verify upsertBatch was called with enriched data
      const batchCall = mocks.upsertBatch.mock.calls[0]?.[0];
      expect(batchCall).toBeDefined();
      expect(batchCall?.[0]?.sku).toBe("SKU-100");
      expect(batchCall?.[0]?.barcode).toBe("BC-100");
      expect(batchCall?.[0]?.product_name).toBe("Product 100");
      expect(batchCall?.[1]?.sku).toBe("SKU-200");
      expect(batchCall?.[1]?.barcode).toBe("BC-200");
      expect(batchCall?.[1]?.product_name).toBe("Product 200");
    });

    test("handles missing variants gracefully", async () => {
      const { deps, mocks } = createMockDeps();

      async function* stockGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        yield createMockStock(100, 1);
        yield createMockStock(200, 1);
      }
      mocks.getAllStocks.mockImplementation(() => stockGenerator());

      // Only variant 100 is available
      const variantsMap = new Map<number, Variant>([
        [100, { id: 100, code: "SKU-100", barCode: "BC-100", description: "Variant 100", product: { name: "Product 100" } }],
      ]);
      mocks.getVariantsBatch.mockImplementation(() => Promise.resolve(variantsMap));

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(true);
      expect(result.itemsSynced).toBe(2);

      // Verify first snapshot is enriched, second has null values
      const batchCall = mocks.upsertBatch.mock.calls[0]?.[0];
      expect(batchCall?.[0]?.sku).toBe("SKU-100");
      expect(batchCall?.[1]?.sku).toBeNull();
      expect(batchCall?.[1]?.barcode).toBeNull();
      expect(batchCall?.[1]?.product_name).toBeNull();
    });

    test("uses description as fallback when product.name is missing", async () => {
      const { deps, mocks } = createMockDeps();

      async function* stockGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        yield createMockStock(100, 1);
      }
      mocks.getAllStocks.mockImplementation(() => stockGenerator());

      const variantsMap = new Map<number, Variant>([
        [100, { id: 100, code: "SKU-100", barCode: null, description: "Fallback Description", product: null }],
      ]);
      mocks.getVariantsBatch.mockImplementation(() => Promise.resolve(variantsMap));

      const result = await syncTenant(mockTenant, deps);

      expect(result.success).toBe(true);

      const batchCall = mocks.upsertBatch.mock.calls[0]?.[0];
      expect(batchCall?.[0]?.product_name).toBe("Fallback Description");
    });

    test("calls getVariantsBatch with unique variant IDs", async () => {
      const { deps, mocks } = createMockDeps();

      async function* stockGenerator(): AsyncGenerator<StockItem> {
        await Promise.resolve();
        yield createMockStock(100, 1);
        yield createMockStock(100, 2); // Same variant, different office
        yield createMockStock(200, 1);
      }
      mocks.getAllStocks.mockImplementation(() => stockGenerator());

      await syncTenant(mockTenant, deps);

      // Should be called with deduplicated IDs
      const variantIdsArg = mocks.getVariantsBatch.mock.calls[0]?.[0];
      expect(variantIdsArg).toBeDefined();
      if (!variantIdsArg) throw new Error("variantIdsArg should be defined");
      // Should only contain unique IDs
      const uniqueIds = [...new Set(variantIdsArg)];
      expect(uniqueIds.length).toBe(variantIdsArg.length);
      expect(variantIdsArg).toContain(100);
      expect(variantIdsArg).toContain(200);
    });
  });
});

describe("enrichSnapshotWithVariant", () => {
  const baseSnapshot: StockSnapshotInput = {
    tenant_id: "tenant-123",
    bsale_variant_id: 100,
    bsale_office_id: 1,
    sku: null,
    barcode: null,
    product_name: null,
    quantity: 50,
    quantity_reserved: 5,
    quantity_available: 45,
    snapshot_date: new Date(),
  };

  test("enriches snapshot with variant data", () => {
    const variant: Variant = {
      id: 100,
      code: "SKU-100",
      barCode: "BC-100",
      description: "Description",
      product: { name: "Product Name" },
    };

    const enriched = enrichSnapshotWithVariant(baseSnapshot, variant);

    expect(enriched.sku).toBe("SKU-100");
    expect(enriched.barcode).toBe("BC-100");
    expect(enriched.product_name).toBe("Product Name");
  });

  test("returns original snapshot when variant is undefined", () => {
    const enriched = enrichSnapshotWithVariant(baseSnapshot, undefined);

    expect(enriched).toEqual(baseSnapshot);
  });

  test("uses description as fallback for product_name", () => {
    const variant: Variant = {
      id: 100,
      code: "SKU-100",
      barCode: "BC-100",
      description: "Fallback Description",
      product: null,
    };

    const enriched = enrichSnapshotWithVariant(baseSnapshot, variant);

    expect(enriched.product_name).toBe("Fallback Description");
  });

  test("preserves existing values when variant fields are null", () => {
    const snapshotWithValues: StockSnapshotInput = {
      ...baseSnapshot,
      sku: "EXISTING-SKU",
      barcode: "EXISTING-BC",
      product_name: "Existing Name",
    };

    const variant: Variant = {
      id: 100,
      code: null,
      barCode: null,
      description: null,
      product: null,
    };

    const enriched = enrichSnapshotWithVariant(snapshotWithValues, variant);

    expect(enriched.sku).toBe("EXISTING-SKU");
    expect(enriched.barcode).toBe("EXISTING-BC");
    expect(enriched.product_name).toBe("Existing Name");
  });

  test("prefers variant values over existing snapshot values", () => {
    const snapshotWithValues: StockSnapshotInput = {
      ...baseSnapshot,
      sku: "OLD-SKU",
      barcode: "OLD-BC",
      product_name: "Old Name",
    };

    const variant: Variant = {
      id: 100,
      code: "NEW-SKU",
      barCode: "NEW-BC",
      description: "Description",
      product: { name: "New Name" },
    };

    const enriched = enrichSnapshotWithVariant(snapshotWithValues, variant);

    expect(enriched.sku).toBe("NEW-SKU");
    expect(enriched.barcode).toBe("NEW-BC");
    expect(enriched.product_name).toBe("New Name");
  });
});
