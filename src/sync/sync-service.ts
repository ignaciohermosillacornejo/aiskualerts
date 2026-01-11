import { BsaleClient } from "@/bsale/client";
import { TenantRepository } from "@/db/repositories/tenant";
import { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { DatabaseClient } from "@/db/client";
import { syncTenant, type TenantSyncDependencies } from "./tenant-sync";
import type { SyncProgress, SyncOptions } from "./types";
import { DEFAULT_SYNC_OPTIONS } from "./types";

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
      console.info("No tenants to sync");
      return progress;
    }

    console.info(`Starting sync for ${String(tenants.length)} tenants`);

    const deps: TenantSyncDependencies = {
      tenantRepo: this.tenantRepo,
      snapshotRepo: this.snapshotRepo,
      createBsaleClient: (accessToken: string) => new BsaleClient(accessToken),
    };

    for (const tenant of tenants) {
      console.info(`Syncing tenant ${tenant.bsale_client_code}`);

      const result = await syncTenant(tenant, deps, this.options);
      progress.results.push(result);
      progress.completedTenants++;

      if (result.success) {
        progress.successCount++;
        console.info(
          `Tenant ${tenant.bsale_client_code} synced: ${String(result.itemsSynced)} items`
        );
      } else {
        progress.failureCount++;
        console.error(
          `Tenant ${tenant.bsale_client_code} failed: ${result.error ?? "Unknown error"}`
        );
      }

      // Delay between tenants to avoid overwhelming the API
      if (progress.completedTenants < progress.totalTenants) {
        await this.delay(this.options.delayBetweenTenants);
      }
    }

    console.info(
      `Sync complete: ${String(progress.successCount)} succeeded, ${String(progress.failureCount)} failed`
    );

    return progress;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
