import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import { SyncService } from "@/sync/sync-service";
import { UserRepository } from "@/db/repositories/user";
import { ThresholdRepository } from "@/db/repositories/threshold";
import { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import { AlertRepository } from "@/db/repositories/alert";
import { generateAlertsForUser } from "@/alerts/alert-generator";
import type { AlertGeneratorDependencies } from "@/alerts/types";
import type { SyncProgress } from "@/sync/types";
import type { AlertGenerationResult } from "@/alerts/types";
import { logger } from "@/utils/logger";

export interface SyncJobResult {
  syncProgress: SyncProgress;
  alertResults: AlertGenerationResult[];
  totalAlertsCreated: number;
  startedAt: Date;
  completedAt: Date;
}

/**
 * Main job that syncs all tenants and generates alerts for users
 * This is the job function passed to the Scheduler
 */
export function createSyncJob(
  db: DatabaseClient,
  config: Config
): () => Promise<void> {
  return async function syncJob(): Promise<void> {
    logger.info("Starting scheduled sync job...");
    const startedAt = new Date();

    try {
      const result = await runSyncAndAlerts(db, config);

      logger.info("Sync job completed", {
        tenantsSynced: result.syncProgress.successCount,
        alertsCreated: result.totalAlertsCreated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Sync job failed", error instanceof Error ? error : new Error(message));
      throw error;
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();
    logger.info("Sync job duration", { durationMs: duration });
  };
}

/**
 * Run the full sync and alert generation process
 */
export async function runSyncAndAlerts(
  db: DatabaseClient,
  config: Config
): Promise<SyncJobResult> {
  const startedAt = new Date();

  // Initialize repositories
  const userRepo = new UserRepository(db);
  const thresholdRepo = new ThresholdRepository(db);
  const snapshotRepo = new StockSnapshotRepository(db);
  const alertRepo = new AlertRepository(db);

  // Step 1: Sync all tenants
  logger.info("Phase 1: Syncing tenant inventory data...");
  const syncService = new SyncService(db, {
    batchSize: config.syncBatchSize,
    delayBetweenTenants: config.syncTenantDelay,
  });
  const syncProgress = await syncService.syncAllTenants();

  // Step 2: Generate alerts for all users in all tenants
  logger.info("Phase 2: Generating alerts for users...");
  const alertResults: AlertGenerationResult[] = [];
  let totalAlertsCreated = 0;

  // Only generate alerts for successfully synced tenants
  const successfulTenantIds = syncProgress.results
    .filter((r) => r.success)
    .map((r) => r.tenantId);

  for (const tenantId of successfulTenantIds) {
    const users = await userRepo.getWithNotificationsEnabled(tenantId);

    for (const user of users) {
      const deps: AlertGeneratorDependencies = {
        getThresholdsByUser: (userId: string) => thresholdRepo.getByUser(userId),
        getStockSnapshot: (tid: string, variantId: number, officeId: number | null) =>
          snapshotRepo.getByVariant(tid, variantId, officeId),
        getHistoricalSnapshots: (tid: string, variantId: number, officeId: number | null, days: number) =>
          snapshotRepo.getHistoricalSnapshots(tid, variantId, officeId, days),
        hasPendingAlert: (userId: string, variantId: number, officeId: number | null, alertType) =>
          alertRepo.hasPendingAlert(userId, variantId, officeId, alertType),
        createAlerts: (alerts) => alertRepo.createBatch(alerts),
      };

      const result = await generateAlertsForUser(user.id, tenantId, deps);
      alertResults.push(result);
      totalAlertsCreated += result.alertsCreated;

      if (result.errors.length > 0) {
        logger.warn("Alert generation errors", { userId: user.id, errors: result.errors });
      }
    }
  }

  const completedAt = new Date();

  return {
    syncProgress,
    alertResults,
    totalAlertsCreated,
    startedAt,
    completedAt,
  };
}
