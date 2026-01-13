import { BsaleClient } from "@/bsale/client";
import { TenantRepository } from "@/db/repositories/tenant";
import { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { DatabaseClient } from "@/db/client";
import { syncTenant, type TenantSyncDependencies } from "./tenant-sync";
import type { SyncProgress, SyncOptions } from "./types";
import { DEFAULT_SYNC_OPTIONS } from "./types";
import { logger } from "@/utils/logger";

export class SyncService {
  private tenantRepo: TenantRepository;
  private snapshotRepo: StockSnapshotRepository;
  private options: SyncOptions;

  constructor(db: DatabaseClient, options: Partial<SyncOptions> = {}) {
    this.tenantRepo = new TenantRepository(db);
    this.snapshotRepo = new StockSnapshotRepository(db);
    this.options = { ...DEFAULT_SYNC_OPTIONS, ...options };
  }

  async syncAllTenants(): Promise<SyncProgress> {
    const tenants = await this.tenantRepo.getActiveTenants();

    const progress: SyncProgress = {
      totalTenants: tenants.length,
      completedTenants: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
    };

    if (tenants.length === 0) {
      logger.info("No tenants to sync");
      return progress;
    }

    logger.info("Starting sync for tenants", { tenantCount: tenants.length });

    const deps: TenantSyncDependencies = {
      tenantRepo: this.tenantRepo,
      snapshotRepo: this.snapshotRepo,
      createBsaleClient: (accessToken: string) => new BsaleClient(accessToken),
    };

    for (const tenant of tenants) {
      logger.info("Syncing tenant", { clientCode: tenant.bsale_client_code });

      const result = await syncTenant(tenant, deps, this.options);
      progress.results.push(result);
      progress.completedTenants++;

      if (result.success) {
        progress.successCount++;
        logger.info("Tenant synced", { clientCode: tenant.bsale_client_code, itemsSynced: result.itemsSynced });
      } else {
        progress.failureCount++;
        logger.error("Tenant sync failed", undefined, { clientCode: tenant.bsale_client_code, error: result.error ?? "Unknown error" });
      }

      // Delay between tenants to avoid overwhelming the API
      if (progress.completedTenants < progress.totalTenants) {
        await this.delay(this.options.delayBetweenTenants);
      }
    }

    logger.info("Sync complete", { successCount: progress.successCount, failureCount: progress.failureCount });

    return progress;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
