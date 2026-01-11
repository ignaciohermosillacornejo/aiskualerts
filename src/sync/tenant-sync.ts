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

/**
 * Convert Bsale stock item to StockSnapshotInput
 *
 * NOTE: SKU, barcode, and product_name are currently set to null because
 * the stock API response only includes variant.id without detailed variant info.
 * Future enhancement: Make additional API call to /v1/variants/:id for complete data.
 */
function stockToSnapshot(
  stock: StockItem,
  tenantId: string,
  snapshotDate: Date
): StockSnapshotInput {
  return {
    tenant_id: tenantId,
    bsale_variant_id: stock.variant.id,
    bsale_office_id: stock.office?.id ?? null,
    // TODO: Fetch variant details for complete product information
    sku: null,
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

    // Distinguish error types for better retry logic
    if (error instanceof BsaleAuthError) {
      // Authentication errors are permanent - mark as failed
      await deps.tenantRepo.updateSyncStatus(tenant.id, "failed");
      console.error(`Authentication failed for tenant ${tenant.id}`);
    } else if (error instanceof BsaleRateLimitError) {
      // Rate limit errors are temporary - mark as pending for retry
      await deps.tenantRepo.updateSyncStatus(tenant.id, "pending");
      console.warn(`Rate limit hit for tenant ${tenant.id}, will retry`);
    } else if (error instanceof Error) {
      // Check for temporary database connectivity issues
      if (errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('timeout')) {
        // Database connectivity issues are temporary - mark as pending for retry
        await deps.tenantRepo.updateSyncStatus(tenant.id, "pending");
        console.warn(`Temporary database error for tenant ${tenant.id}, will retry`);
      } else {
        // All other errors are permanent - mark as failed
        await deps.tenantRepo.updateSyncStatus(tenant.id, "failed");
        console.error(`Sync failed for tenant ${tenant.id}: ${errorMessage}`);
      }
    } else {
      // Unknown error type - mark as failed
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
