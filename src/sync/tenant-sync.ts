import type { BsaleClient } from "@/bsale/client";
import type { StockItem } from "@/bsale/types";
import type { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { Tenant, StockSnapshotInput } from "@/db/repositories/types";
import type { SyncResult, SyncOptions } from "./types";
import { DEFAULT_SYNC_OPTIONS } from "./types";
import { BsaleAuthError, BsaleRateLimitError } from "@/lib/errors";

export interface TenantSyncDependencies {
  tenantRepo: TenantRepository;
  snapshotRepo: StockSnapshotRepository;
  createBsaleClient: (accessToken: string) => BsaleClient;
}

function stockToSnapshot(
  stock: StockItem,
  tenantId: string,
  snapshotDate: Date
): StockSnapshotInput {
  return {
    tenant_id: tenantId,
    bsale_variant_id: stock.variant.id,
    bsale_office_id: stock.office?.id ?? null,
    sku: null, // Variant details need separate API call
    barcode: null,
    product_name: null,
    quantity: stock.quantity,
    quantity_reserved: stock.quantityReserved,
    quantity_available: stock.quantityAvailable,
    snapshot_date: snapshotDate,
  };
}

export async function syncTenant(
  tenant: Tenant,
  deps: TenantSyncDependencies,
  options: SyncOptions = DEFAULT_SYNC_OPTIONS
): Promise<SyncResult> {
  const startedAt = new Date();

  try {
    await deps.tenantRepo.updateSyncStatus(tenant.id, "syncing");

    const client = deps.createBsaleClient(tenant.bsale_access_token);
    const snapshotDate = new Date();
    let itemsSynced = 0;
    let batch: StockSnapshotInput[] = [];

    for await (const stock of client.getAllStocks()) {
      const snapshot = stockToSnapshot(stock, tenant.id, snapshotDate);
      batch.push(snapshot);

      if (batch.length >= options.batchSize) {
        await deps.snapshotRepo.upsertBatch(batch);
        itemsSynced += batch.length;
        batch = [];
      }
    }

    // Insert remaining items
    if (batch.length > 0) {
      await deps.snapshotRepo.upsertBatch(batch);
      itemsSynced += batch.length;
    }

    await deps.tenantRepo.updateSyncStatus(tenant.id, "success", new Date());

    return {
      tenantId: tenant.id,
      success: true,
      itemsSynced,
      startedAt,
      completedAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Handle specific error types
    if (error instanceof BsaleAuthError) {
      await deps.tenantRepo.updateSyncStatus(tenant.id, "failed");
    } else if (error instanceof BsaleRateLimitError) {
      // Leave as syncing so it can be retried
      await deps.tenantRepo.updateSyncStatus(tenant.id, "pending");
    } else {
      await deps.tenantRepo.updateSyncStatus(tenant.id, "failed");
    }

    return {
      tenantId: tenant.id,
      success: false,
      itemsSynced: 0,
      error: errorMessage,
      startedAt,
      completedAt: new Date(),
    };
  }
}
