import type { Alert, StockSnapshot, Threshold } from "@/db/repositories/types";
import type { createVelocityCalculator } from "@/services/velocity-calculator";

export interface AlertResetDeps {
  getDismissedAlerts: (tenantId: string) => Promise<Alert[]>;
  getStockSnapshot: (tenantId: string, variantId: number, officeId: number | null) => Promise<StockSnapshot | null>;
  getThreshold: (tenantId: string, variantId: number, officeId: number | null) => Promise<Threshold | null>;
  velocityCalculator?: ReturnType<typeof createVelocityCalculator>;
  resetAlert: (alertId: string) => Promise<void>;
}

export interface AlertResetResult {
  alertsChecked: number;
  alertsReset: number;
  errors: string[];
}

export function createAlertResetService(deps: AlertResetDeps) {
  return {
    async resetRecoveredAlerts(tenantId: string): Promise<AlertResetResult> {
      const result: AlertResetResult = {
        alertsChecked: 0,
        alertsReset: 0,
        errors: [],
      };

      const dismissedAlerts = await deps.getDismissedAlerts(tenantId);

      for (const alert of dismissedAlerts) {
        result.alertsChecked++;

        try {
          const snapshot = await deps.getStockSnapshot(
            tenantId,
            alert.bsale_variant_id,
            alert.bsale_office_id
          );
          if (!snapshot) continue;

          const threshold = await deps.getThreshold(
            tenantId,
            alert.bsale_variant_id,
            alert.bsale_office_id
          );
          if (!threshold) continue;

          let hasRecovered = false;

          if (threshold.threshold_type === "quantity") {
            // For quantity thresholds: recovered if stock >= min_quantity
            hasRecovered = snapshot.quantity_available >= (threshold.min_quantity ?? 0);
          } else if (deps.velocityCalculator) {
            // For days thresholds: recovered if days left >= min_days
            const velocity = await deps.velocityCalculator.calculateDaysLeft({
              tenantId,
              variantId: alert.bsale_variant_id,
              officeId: alert.bsale_office_id,
              currentStock: snapshot.quantity_available,
            });
            hasRecovered = velocity.daysLeft >= (threshold.min_days ?? 0);
          }

          if (hasRecovered) {
            await deps.resetAlert(alert.id);
            result.alertsReset++;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          result.errors.push(`Failed to check alert ${alert.id}: ${message}`);
        }
      }

      return result;
    },
  };
}
