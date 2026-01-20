import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import type { EmailClient } from "@/email/resend-client";
import { TenantRepository } from "@/db/repositories/tenant";
import { UserRepository } from "@/db/repositories/user";
import { AlertRepository } from "@/db/repositories/alert";
import { renderDailyDigestEmail, type AlertSummary } from "@/email/templates/daily-digest";
import type { Alert, DigestFrequency, User } from "@/db/repositories/types";
import { logger } from "@/utils/logger";
import type { ThresholdLimitService } from "@/billing/threshold-limit-service";

export interface DigestJobResult {
  tenantsProcessed: number;
  emailsSent: number;
  emailsFailed: number;
  alertsMarkedSent: number;
  startedAt: Date;
  completedAt: Date;
  errors: string[];
}

export interface DigestJobDependencies {
  db: DatabaseClient;
  config: Config;
  emailClient: EmailClient;
  thresholdLimitService: ThresholdLimitService;
}

/**
 * Create a digest job function that can be scheduled
 */
export function createDigestJob(
  deps: DigestJobDependencies
): () => Promise<void> {
  return async function digestJob(): Promise<void> {
    logger.info("Starting scheduled digest job...");
    const startedAt = new Date();

    try {
      const result = await runDigestJob(deps);

      logger.info("Digest job completed", {
        emailsSent: result.emailsSent,
        alertsMarkedSent: result.alertsMarkedSent,
      });

      if (result.errors.length > 0) {
        logger.warn("Digest job completed with errors", { errorCount: result.errors.length, errors: result.errors });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Digest job failed", error instanceof Error ? error : new Error(message));
      throw error;
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();
    logger.info("Digest job duration", { durationMs: duration });
  };
}

/**
 * Group items by a key extracted from each item
 */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/**
 * Run the digest job for a specific frequency (daily or weekly)
 */
export async function runDigestJob(
  deps: DigestJobDependencies,
  frequency: DigestFrequency = "daily"
): Promise<DigestJobResult> {
  const startedAt = new Date();
  const errors: string[] = [];

  const tenantRepo = new TenantRepository(deps.db);
  const userRepo = new UserRepository(deps.db);
  const alertRepo = new AlertRepository(deps.db);

  let tenantsProcessed = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let alertsMarkedSent = 0;

  // Get all active tenants
  const tenants = await tenantRepo.getActiveTenants();

  if (tenants.length === 0) {
    return {
      tenantsProcessed,
      emailsSent,
      emailsFailed,
      alertsMarkedSent,
      startedAt,
      completedAt: new Date(),
      errors,
    };
  }

  const tenantIds = tenants.map((t) => t.id);

  // Batch fetch all users and alerts (3 queries total instead of 1+2N)
  const [allUsers, allAlerts] = await Promise.all([
    userRepo.getWithDigestEnabledBatch(tenantIds, frequency),
    alertRepo.getPendingByTenants(tenantIds),
  ]);

  // Group by tenant_id in memory
  const usersByTenant = groupBy(allUsers, (u) => u.tenant_id);
  const alertsByTenant = groupBy(allAlerts, (a) => a.tenant_id);

  for (const tenant of tenants) {
    try {
      const users = usersByTenant.get(tenant.id) ?? [];

      if (users.length === 0) {
        continue;
      }

      const pendingAlerts = alertsByTenant.get(tenant.id) ?? [];

      if (pendingAlerts.length === 0) {
        continue;
      }

      tenantsProcessed++;

      // Create user lookup map for O(1) access
      const userMap = new Map(users.map((u) => [u.id, u]));

      // Group alerts by user
      const alertsByUser = groupAlertsByUser(pendingAlerts, users);

      for (const [userId, userAlerts] of alertsByUser) {
        const user = userMap.get(userId);
        if (!user || userAlerts.length === 0) {
          continue;
        }

        // Determine the email address to send to
        const emailTo = user.notification_email ?? user.email;

        // Convert alerts to summary format
        const alertSummaries: AlertSummary[] = userAlerts.map((alert) => ({
          sku: alert.sku ?? "N/A",
          productName: alert.product_name ?? `Product ${String(alert.bsale_variant_id)}`,
          currentStock: alert.current_quantity,
          threshold: alert.threshold_quantity,
          alertType: alert.alert_type,
        }));

        // Get skipped threshold count for free users
        let skippedCount = 0;
        try {
          skippedCount = await deps.thresholdLimitService.getSkippedCount(userId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Error getting skipped count for user ${userId}: ${message}`);
        }

        // Build upgrade URL only if user has skipped thresholds
        const upgradeUrl = skippedCount > 0 && deps.config.appUrl
          ? `${deps.config.appUrl}/settings/billing`
          : null;

        // Render email HTML
        const tenantDisplayName = tenant.bsale_client_name ?? "Tu empresa";
        const emailHtml = renderDailyDigestEmail({
          tenantName: tenantDisplayName,
          date: new Date(),
          alerts: alertSummaries,
          skippedThresholdCount: skippedCount,
          ...(upgradeUrl && { upgradeUrl }),
        });

        if (!emailHtml) {
          continue;
        }

        // Send the email
        const result = await deps.emailClient.sendEmail({
          to: emailTo,
          subject: `Resumen de Alertas - ${tenantDisplayName}`,
          html: emailHtml,
        });

        if (result.success) {
          emailsSent++;

          // Mark alerts as sent
          const alertIds = userAlerts.map((a) => a.id);
          await alertRepo.markAsSent(alertIds);
          alertsMarkedSent += alertIds.length;
        } else {
          emailsFailed++;
          errors.push(`Failed to send email to ${emailTo}: ${result.error ?? "Unknown error"}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Error processing tenant ${tenant.id}: ${message}`);
    }
  }

  const completedAt = new Date();

  return {
    tenantsProcessed,
    emailsSent,
    emailsFailed,
    alertsMarkedSent,
    startedAt,
    completedAt,
    errors,
  };
}

/**
 * Group alerts by user ID, only including alerts that belong to users in the provided list
 */
function groupAlertsByUser(
  alerts: Alert[],
  users: User[]
): Map<string, Alert[]> {
  const userIds = new Set(users.map((u) => u.id));
  const alertsByUser = new Map<string, Alert[]>();

  for (const alert of alerts) {
    if (!userIds.has(alert.user_id)) {
      continue;
    }

    const existing = alertsByUser.get(alert.user_id);
    if (existing) {
      existing.push(alert);
    } else {
      alertsByUser.set(alert.user_id, [alert]);
    }
  }

  return alertsByUser;
}
