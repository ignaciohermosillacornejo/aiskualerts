import type { BsaleClient } from "@/bsale/client";
import type { StockItem, Variant } from "@/bsale/types";
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
 * Convert Bsale stock item to StockSnapshotInput with optional variant enrichment
 */
function stockToSnapshot(
  stock: StockItem,
  tenantId: string,
  snapshotDate: Date,
  variant?: Variant
): StockSnapshotInput {
  return {
    tenant_id: tenantId,
    bsale_variant_id: stock.variant.id,
    bsale_office_id: stock.office?.id ?? null,
    sku: variant?.code ?? null,
    barcode: variant?.barCode ?? null,
    product_name: variant?.product?.name ?? variant?.description ?? null,
    quantity: stock.quantity,
    quantity_reserved: stock.quantityReserved,
    quantity_available: stock.quantityAvailable,
    snapshot_date: snapshotDate,
  };
}

/**
 * Enrich stock snapshot with variant details
 */
export function enrichSnapshotWithVariant(
  snapshot: StockSnapshotInput,
  variant: Variant | undefined
): StockSnapshotInput {
  if (!variant) {
    return snapshot;
  }
  return {
    ...snapshot,
    sku: variant.code ?? snapshot.sku,
    barcode: variant.barCode ?? snapshot.barcode,
    product_name: variant.product?.name ?? variant.description ?? snapshot.product_name,
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

    // Collect all stock items first
    const stockItems: StockItem[] = [];
    for await (const stock of client.getAllStocks()) {
      stockItems.push(stock);
    }

    // Extract unique variant IDs
    const variantIds = [...new Set(stockItems.map((s) => s.variant.id))];

    // Batch fetch variant details
    const variantsMap = await client.getVariantsBatch(variantIds);

    // Process stocks in batches with enriched data
    let batch: StockSnapshotInput[] = [];
    for (const stock of stockItems) {
      const variant = variantsMap.get(stock.variant.id);
      const snapshot = stockToSnapshot(stock, tenant.id, snapshotDate, variant);
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
