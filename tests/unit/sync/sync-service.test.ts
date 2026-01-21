import { test, expect, describe, mock, spyOn, beforeEach, afterEach } from "bun:test";
import type { Tenant } from "@/db/repositories/types";
import type { StockItem, Variant } from "@/bsale/types";

// Mock BsaleClient module to control API responses
const mockGetAllStocks = mock<() => AsyncGenerator<StockItem>>(() => {
  // Default: return empty generator
  // eslint-disable-next-line require-yield
  async function* emptyGenerator(): AsyncGenerator<StockItem> {
    await Promise.resolve();
  }
  return emptyGenerator();
});

const mockGetVariantsBatch = mock<(ids: number[]) => Promise<Map<number, Variant>>>(
  () => Promise.resolve(new Map<number, Variant>())
);

const mockGetAllPrices = mock<() => Promise<Map<number, number>>>(
  () => Promise.resolve(new Map<number, number>())
);

class MockBsaleClient {
  getAllStocks(): AsyncGenerator<StockItem> {
    return mockGetAllStocks();
  }
  getVariantsBatch(ids: number[]): Promise<Map<number, Variant>> {
    return mockGetVariantsBatch(ids);
  }
  getAllPrices(): Promise<Map<number, number>> {
    return mockGetAllPrices();
  }
}

// Mock the BsaleClient module
void mock.module("@/bsale/client", () => ({
  BsaleClient: MockBsaleClient,
}));

// Import SyncService after mocking
const { SyncService } = await import("@/sync/sync-service");

// Mock tenants
const mockTenant1: Tenant = {
  id: "tenant-1",
  owner_id: "user-owner-1",
  bsale_client_code: "11111111-1",
  bsale_client_name: "Test Company 1",
  bsale_access_token: "token-1",
  sync_status: "pending",
  last_sync_at: null,
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockTenant2: Tenant = {
  id: "tenant-2",
  owner_id: "user-owner-2",
  bsale_client_code: "22222222-2",
  bsale_client_name: "Test Company 2",
  bsale_access_token: "token-2",
  sync_status: "pending",
  last_sync_at: null,
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockTenant3: Tenant = {
  id: "tenant-3",
  owner_id: "user-owner-3",
  bsale_client_code: "33333333-3",
  bsale_client_name: "Test Company 3",
  bsale_access_token: "token-3",
  sync_status: "pending",
  last_sync_at: null,
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

interface MockDbClient {
  query: ReturnType<typeof mock>;
  queryOne: ReturnType<typeof mock>;
  execute: ReturnType<typeof mock>;
}

function createMockDbClient(): MockDbClient {
  return {
    query: mock(() => Promise.resolve([])),
    queryOne: mock(() => Promise.resolve(null)),
    execute: mock(() => Promise.resolve()),
  };
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

describe("SyncService", () => {
  let consoleInfoSpy: ReturnType<typeof spyOn<Console, "info">>;
  let consoleErrorSpy: ReturnType<typeof spyOn<Console, "error">>;
  let consoleWarnSpy: ReturnType<typeof spyOn<Console, "warn">>;

  beforeEach(() => {
    mockGetAllStocks.mockClear();
    mockGetVariantsBatch.mockClear();
    consoleInfoSpy = spyOn(console, "info").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("constructor", () => {
    test("creates service with default options", () => {
      const mockDb = createMockDbClient();
      const service = new SyncService(mockDb as unknown as import("@/db/client").DatabaseClient);

      expect(service).toBeDefined();
    });

    test("creates service with custom options", () => {
      const mockDb = createMockDbClient();
      const service = new SyncService(
        mockDb as unknown as import("@/db/client").DatabaseClient,
        { batchSize: 50, delayBetweenTenants: 1000 }
      );

      expect(service).toBeDefined();
    });

    test("merges partial options with defaults", () => {
      const mockDb = createMockDbClient();
      const service = new SyncService(
        mockDb as unknown as import("@/db/client").DatabaseClient,
        { batchSize: 200 }
      );

      expect(service).toBeDefined();
    });
  });

  describe("syncAllTenants", () => {
    describe("with no tenants", () => {
      test("returns empty progress when no tenants exist", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([]));

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();

        expect(progress.totalTenants).toBe(0);
        expect(progress.completedTenants).toBe(0);
        expect(progress.successCount).toBe(0);
        expect(progress.failureCount).toBe(0);
        expect(progress.results).toEqual([]);
      });

      test("logs info message when no tenants to sync", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([]));

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        await service.syncAllTenants();

        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining("No tenants to sync"));
      });
    });

    describe("tenant iteration", () => {
      test("iterates through all tenants", async () => {
        const mockDb = createMockDbClient();
        const tenants = [mockTenant1, mockTenant2, mockTenant3];
        mockDb.query.mockImplementation(() => Promise.resolve(tenants));

        // Setup empty stock generator for each call
        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();

        expect(progress.totalTenants).toBe(3);
        expect(progress.completedTenants).toBe(3);
        expect(progress.results.length).toBe(3);
      });

      test("logs starting sync message with tenant count", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1, mockTenant2]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        await service.syncAllTenants();

        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Starting sync for tenants"));
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('"tenantCount":2'));
      });

      test("logs sync progress for each tenant", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        await service.syncAllTenants();

        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Syncing tenant"));
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('"clientCode":"11111111-1"'));
      });
    });

    describe("result aggregation", () => {
      test("aggregates success counts correctly", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() =>
          Promise.resolve([mockTenant1, mockTenant2, mockTenant3])
        );

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();

        expect(progress.successCount).toBe(3);
        expect(progress.failureCount).toBe(0);
        expect(progress.completedTenants).toBe(3);
      });

      test("collects all sync results in order", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1, mockTenant2]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();

        expect(progress.results.length).toBe(2);
        expect(progress.results[0]?.tenantId).toBe("tenant-1");
        expect(progress.results[1]?.tenantId).toBe("tenant-2");
      });

      test("logs completion summary with correct counts", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() =>
          Promise.resolve([mockTenant1, mockTenant2, mockTenant3])
        );

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        await service.syncAllTenants();

        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Sync complete"));
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('"successCount":3'));
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('"failureCount":0'));
      });

      test("logs success message for successful tenant sync", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1]));

        mockGetAllStocks.mockImplementation(() => {
          async function* generator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
            yield createMockStock(100, 1);
            yield createMockStock(200, 1);
          }
          return generator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        await service.syncAllTenants();

        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Tenant synced"));
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('"clientCode":"11111111-1"'));
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('"itemsSynced":2'));
      });
    });

    describe("delay between syncs", () => {
      test("applies delay between tenant syncs", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1, mockTenant2]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 50, batchSize: 100 }
        );

        const start = Date.now();
        await service.syncAllTenants();
        const elapsed = Date.now() - start;

        // Should have at least one delay of ~50ms (between tenant 1 and 2)
        expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some margin
      });

      test("does not apply delay after last tenant", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 100, batchSize: 100 }
        );

        const start = Date.now();
        await service.syncAllTenants();
        const elapsed = Date.now() - start;

        // With only one tenant, no delay should be applied
        expect(elapsed).toBeLessThan(100);
      });

      test("uses custom delay from options", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() =>
          Promise.resolve([mockTenant1, mockTenant2, mockTenant3])
        );

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const customDelay = 30;
        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: customDelay, batchSize: 100 }
        );

        const start = Date.now();
        await service.syncAllTenants();
        const elapsed = Date.now() - start;

        // With 3 tenants, should have 2 delays of ~30ms each = 60ms min
        expect(elapsed).toBeGreaterThanOrEqual(customDelay * 2 - 10);
      });

      test("applies zero delay when configured", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1, mockTenant2]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0, batchSize: 100 }
        );

        const start = Date.now();
        await service.syncAllTenants();
        const elapsed = Date.now() - start;

        // With zero delay, should complete quickly
        expect(elapsed).toBeLessThan(100);
      });
    });

    describe("progress tracking", () => {
      test("initializes progress with correct total", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() =>
          Promise.resolve([mockTenant1, mockTenant2, mockTenant3])
        );

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();

        expect(progress.totalTenants).toBe(3);
      });

      test("updates completed count after each tenant", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1, mockTenant2]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();

        expect(progress.completedTenants).toBe(2);
        expect(progress.completedTenants).toBe(progress.totalTenants);
      });

      test("tracks items synced per tenant in results", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1]));

        mockGetAllStocks.mockImplementation(() => {
          async function* generator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
            yield createMockStock(100);
            yield createMockStock(200);
            yield createMockStock(300);
          }
          return generator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();

        expect(progress.results[0]?.itemsSynced).toBe(3);
      });

      test("includes timing info in results", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1]));

        mockGetAllStocks.mockImplementation(() => {
          // eslint-disable-next-line require-yield
          async function* emptyGenerator(): AsyncGenerator<StockItem> {
            await Promise.resolve();
          }
          return emptyGenerator();
        });

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const before = new Date();
        const progress = await service.syncAllTenants();
        const after = new Date();

        const result = progress.results[0];
        expect(result).toBeDefined();
        expect(result?.startedAt).toBeDefined();
        expect(result?.completedAt).toBeDefined();
        expect(result?.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result?.completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });

    describe("options handling", () => {
      test("uses default batchSize when not specified", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([]));

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient,
          { delayBetweenTenants: 0 }
        );

        const progress = await service.syncAllTenants();
        expect(progress).toBeDefined();
      });

      test("uses default delayBetweenTenants when not specified", async () => {
        const mockDb = createMockDbClient();
        mockDb.query.mockImplementation(() => Promise.resolve([]));

        const service = new SyncService(
          mockDb as unknown as import("@/db/client").DatabaseClient
        );

        const progress = await service.syncAllTenants();
        expect(progress).toBeDefined();
      });
    });
  });
});

describe("SyncService integration behavior", () => {
  let consoleInfoSpy: ReturnType<typeof spyOn<Console, "info">>;
  let consoleErrorSpy: ReturnType<typeof spyOn<Console, "error">>;
  let consoleWarnSpy: ReturnType<typeof spyOn<Console, "warn">>;

  beforeEach(() => {
    mockGetAllStocks.mockClear();
    mockGetVariantsBatch.mockClear();
    consoleInfoSpy = spyOn(console, "info").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("sequential tenant processing", () => {
    test("processes tenants one at a time sequentially", async () => {
      const mockDb = createMockDbClient();
      const processingOrder: string[] = [];

      mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1, mockTenant2]));

      // Track tenant processing order via console logs
      // New log format: "2026-01-13T21:53:19.478Z [INFO ] Syncing tenant {"clientCode":"11111111-1"}"
      const clientCodeRegex = /"clientCode":"([\d-]+)"/;
      consoleInfoSpy.mockImplementation((...args: unknown[]) => {
        const msg = String(args[0]);
        if (msg.includes("Syncing tenant")) {
          const match = clientCodeRegex.exec(msg);
          if (match?.[1]) {
            processingOrder.push(match[1]);
          }
        }
      });

      mockGetAllStocks.mockImplementation(() => {
        // eslint-disable-next-line require-yield
        async function* emptyGenerator(): AsyncGenerator<StockItem> {
          await Promise.resolve();
        }
        return emptyGenerator();
      });

      const service = new SyncService(
        mockDb as unknown as import("@/db/client").DatabaseClient,
        { delayBetweenTenants: 0 }
      );

      await service.syncAllTenants();

      expect(processingOrder).toEqual(["11111111-1", "22222222-2"]);
    });
  });

  describe("syncing stock items", () => {
    test("syncs stock items from API", async () => {
      const mockDb = createMockDbClient();
      mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1]));

      mockGetAllStocks.mockImplementation(() => {
        async function* generator(): AsyncGenerator<StockItem> {
          await Promise.resolve();
          yield createMockStock(100, 1);
          yield createMockStock(200, 1);
        }
        return generator();
      });

      const service = new SyncService(
        mockDb as unknown as import("@/db/client").DatabaseClient,
        { delayBetweenTenants: 0 }
      );

      const progress = await service.syncAllTenants();

      expect(progress.results[0]?.success).toBe(true);
      expect(progress.results[0]?.itemsSynced).toBe(2);
    });

    test("handles tenants with no stock items", async () => {
      const mockDb = createMockDbClient();
      mockDb.query.mockImplementation(() => Promise.resolve([mockTenant1]));

      mockGetAllStocks.mockImplementation(() => {
        // eslint-disable-next-line require-yield
        async function* emptyGenerator(): AsyncGenerator<StockItem> {
          await Promise.resolve();
        }
        return emptyGenerator();
      });

      const service = new SyncService(
        mockDb as unknown as import("@/db/client").DatabaseClient,
        { delayBetweenTenants: 0 }
      );

      const progress = await service.syncAllTenants();

      expect(progress.results[0]?.success).toBe(true);
      expect(progress.results[0]?.itemsSynced).toBe(0);
    });
  });

  describe("large tenant count", () => {
    test("handles many tenants correctly", async () => {
      const mockDb = createMockDbClient();
      const manyTenants = Array.from({ length: 10 }, (_, i) => ({
        ...mockTenant1,
        id: `tenant-${String(i + 1)}`,
        bsale_client_code: `${String(10000000 + i)}-${String(i)}`,
      }));

      mockDb.query.mockImplementation(() => Promise.resolve(manyTenants));

      mockGetAllStocks.mockImplementation(() => {
        // eslint-disable-next-line require-yield
        async function* emptyGenerator(): AsyncGenerator<StockItem> {
          await Promise.resolve();
        }
        return emptyGenerator();
      });

      const service = new SyncService(
        mockDb as unknown as import("@/db/client").DatabaseClient,
        { delayBetweenTenants: 0 }
      );

      const progress = await service.syncAllTenants();

      expect(progress.totalTenants).toBe(10);
      expect(progress.completedTenants).toBe(10);
      expect(progress.results.length).toBe(10);
    });
  });
});
