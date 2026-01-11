import type { AlertInput, Threshold, StockSnapshot } from "@/db/repositories/types";
import type {
  AlertGeneratorDependencies,
  AlertGenerationResult,
  ThresholdCheck,
} from "./types";

/**
 * Check if a threshold breach should trigger an alert
 */
export function checkThresholdBreach(
  threshold: Threshold,
  snapshot: StockSnapshot | null
): ThresholdCheck {
  if (!snapshot) {
    return {
      threshold,
      snapshot: null,
      shouldAlert: false,
      reason: "No stock snapshot found",
    };
  }

  const currentQuantity = snapshot.quantity_available;
  const thresholdQuantity = threshold.min_quantity;

  if (currentQuantity < thresholdQuantity) {
    return {
      threshold,
      snapshot,
      shouldAlert: true,
      reason: `Stock ${String(currentQuantity)} is below threshold ${String(thresholdQuantity)}`,
    };
  }

  return {
    threshold,
    snapshot,
    shouldAlert: false,
    reason: null,
  };
}

/**
 * Create an AlertInput from a threshold breach check
 */
export function createAlertInput(
  check: ThresholdCheck
): AlertInput | null {
  if (!check.shouldAlert || !check.snapshot) {
    return null;
  }

  return {
    tenant_id: check.threshold.tenant_id,
    user_id: check.threshold.user_id,
    bsale_variant_id: check.snapshot.bsale_variant_id,
    bsale_office_id: check.snapshot.bsale_office_id,
    sku: check.snapshot.sku,
    product_name: check.snapshot.product_name,
    alert_type: "threshold_breach",
    current_quantity: check.snapshot.quantity_available,
    threshold_quantity: check.threshold.min_quantity,
    days_to_stockout: null,
  };
}

/**
 * Generate alerts for a specific user based on their thresholds
 */
export async function generateAlertsForUser(
  userId: string,
  tenantId: string,
  deps: AlertGeneratorDependencies
): Promise<AlertGenerationResult> {
  const result: AlertGenerationResult = {
    userId,
    thresholdsChecked: 0,
    alertsCreated: 0,
    errors: [],
  };

  let thresholds: Threshold[];
  try {
    thresholds = await deps.getThresholdsByUser(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Failed to get thresholds: ${message}`);
    return result;
  }

  const alertsToCreate: AlertInput[] = [];

  for (const threshold of thresholds) {
    result.thresholdsChecked++;

    try {
      // For thresholds with specific variant, check that variant
      // For global thresholds (variant_id IS NULL), skip - they need special handling
      if (threshold.bsale_variant_id === null) {
        continue;
      }

      const snapshot = await deps.getStockSnapshot(
        tenantId,
        threshold.bsale_variant_id,
        threshold.bsale_office_id
      );

      const check = checkThresholdBreach(threshold, snapshot);

      if (check.shouldAlert && check.snapshot) {
        // Check if there's already a pending alert
        const hasPending = await deps.hasPendingAlert(
          userId,
          check.snapshot.bsale_variant_id,
          check.snapshot.bsale_office_id,
          "threshold_breach"
        );

        if (!hasPending) {
          const alertInput = createAlertInput(check);
          if (alertInput) {
            alertsToCreate.push(alertInput);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(
        `Failed to check threshold ${threshold.id}: ${message}`
      );
    }
  }

  if (alertsToCreate.length > 0) {
    try {
      result.alertsCreated = await deps.createAlerts(alertsToCreate);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Failed to create alerts: ${message}`);
    }
  }

  return result;
}
