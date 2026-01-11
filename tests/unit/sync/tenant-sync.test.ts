import { test, expect, describe, mock, type Mock } from "bun:test";
import { syncTenant, type TenantSyncDependencies } from "@/sync/tenant-sync";
import type { Tenant } from "@/db/repositories/types";
import type { StockItem } from "@/bsale/types";
import { BsaleAuthError, BsaleRateLimitError } from "@/lib/errors";

const mockTenant: Tenant = {
  id: "tenant-123",
  bsale_client_code: "12345678-9",
  bsale_client_name: "Test Company",
  bsale_access_token: "test-token",
  sync_status: "pending",
  last_sync_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

interface MockDeps {
  updateSyncStatus: Mock<() => Promise<void>>;
  upsertBatch: Mock<() => Promise<number>>;
  getAllStocks: Mock<() => AsyncGenerator<StockItem>>;
}

function createMockDeps(): { deps: TenantSyncDependencies; mocks: MockDeps } {
  const updateSyncStatus = mock(() => Promise.resolve());
  const upsertBatch = mock(() => Promise.resolve(0));

  // eslint-disable-next-line require-yield
  async function* emptyGenerator(): AsyncGenerator<StockItem> {
    await Promise.resolve();
  }
  const getAllStocks = mock(() => emptyGenerator());

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
      }) as unknown as ReturnType<TenantSyncDependencies["createBsaleClient"]>,
  };

  return { deps, mocks: { updateSyncStatus, upsertBatch, getAllStocks } };
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
});
