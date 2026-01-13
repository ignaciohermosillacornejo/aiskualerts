import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import type { EmailClient } from "@/email/resend-client";
import { TenantRepository } from "@/db/repositories/tenant";
import { UserRepository } from "@/db/repositories/user";
import { AlertRepository } from "@/db/repositories/alert";
import { renderDailyDigestEmail, type AlertSummary } from "@/email/templates/daily-digest";
import type { Alert, DigestFrequency, User } from "@/db/repositories/types";

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
}

/**
 * Create a digest job function that can be scheduled
 */
export function createDigestJob(
  deps: DigestJobDependencies
): () => Promise<void> {
  return async function digestJob(): Promise<void> {
    console.info("Starting scheduled digest job...");
    const startedAt = new Date();

    try {
      const result = await runDigestJob(deps);

      console.info(
        `Digest job completed: ${String(result.emailsSent)} emails sent, ` +
          `${String(result.alertsMarkedSent)} alerts marked as sent`
      );

      if (result.errors.length > 0) {
        console.warn(`Digest job completed with ${String(result.errors.length)} errors:`, result.errors);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Digest job failed: ${message}`);
      throw error;
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();
    console.info(`Digest job duration: ${String(duration)}ms`);
  };
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

  for (const tenant of tenants) {
    try {
      // Get users who want digest emails at this frequency
      const users = await userRepo.getWithDigestEnabled(tenant.id, frequency);

      if (users.length === 0) {
        continue;
      }

      // Get pending alerts for this tenant
      const pendingAlerts = await alertRepo.getPendingByTenant(tenant.id);

      if (pendingAlerts.length === 0) {
        continue;
      }

      tenantsProcessed++;

      // Group alerts by user
      const alertsByUser = groupAlertsByUser(pendingAlerts, users);

      for (const [userId, userAlerts] of alertsByUser) {
        const user = users.find((u) => u.id === userId);
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

        // Render email HTML
        const emailHtml = renderDailyDigestEmail({
          tenantName: tenant.bsale_client_name,
          date: new Date(),
          alerts: alertSummaries,
        });

        if (!emailHtml) {
          continue;
        }

        // Send the email
        const result = await deps.emailClient.sendEmail({
          to: emailTo,
          subject: `Resumen de Alertas - ${tenant.bsale_client_name}`,
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
