import type { AlertInput, Threshold, StockSnapshot } from "@/db/repositories/types";
import type {
  AlertGeneratorDependencies,
  AlertGenerationResult,
  ThresholdCheck,
} from "./types";
import { checkVelocityAlert } from "./velocity-calculator";

const VELOCITY_HISTORY_DAYS = 7;

/**
 * Check if a threshold breach should trigger an alert
 * Note: This function handles quantity-based thresholds.
 * Days-based thresholds are handled separately via velocity calculations.
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

  // Days-based thresholds are handled separately via velocity calculations
  if (threshold.threshold_type === "days" || threshold.min_quantity === null) {
    return {
      threshold,
      snapshot,
      shouldAlert: false,
      reason: "Days-based threshold - handled via velocity",
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

  // Determine alert type based on quantity
  const alertType =
    check.snapshot.quantity_available === 0
      ? "out_of_stock"
      : "low_stock";

  return {
    tenant_id: check.threshold.tenant_id,
    user_id: check.threshold.user_id,
    bsale_variant_id: check.snapshot.bsale_variant_id,
    bsale_office_id: check.snapshot.bsale_office_id,
    sku: check.snapshot.sku,
    product_name: check.snapshot.product_name,
    alert_type: alertType,
    current_quantity: check.snapshot.quantity_available,
    threshold_quantity: check.threshold.min_quantity,
    days_to_stockout: null,
  };
}

/**
 * Create an AlertInput for a low velocity alert
 */
export function createVelocityAlertInput(
  threshold: Threshold,
  snapshot: StockSnapshot,
  daysToStockout: number
): AlertInput {
  return {
    tenant_id: threshold.tenant_id,
    user_id: threshold.user_id,
    bsale_variant_id: snapshot.bsale_variant_id,
    bsale_office_id: snapshot.bsale_office_id,
    sku: snapshot.sku,
    product_name: snapshot.product_name,
    alert_type: "low_velocity",
    current_quantity: snapshot.quantity_available,
    threshold_quantity: null,
    days_to_stockout: daysToStockout,
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

      // Store non-null variant_id for TypeScript narrowing
      const variantId = threshold.bsale_variant_id;

      const snapshot = await deps.getStockSnapshot(
        tenantId,
        variantId,
        threshold.bsale_office_id
      );

      const check = checkThresholdBreach(threshold, snapshot);

      if (check.shouldAlert && check.snapshot) {
        // Determine alert type for pending check
        const alertType =
          check.snapshot.quantity_available === 0
            ? "out_of_stock"
            : "low_stock";

        // Check if there's already a pending alert
        const hasPending = await deps.hasPendingAlert(
          userId,
          check.snapshot.bsale_variant_id,
          check.snapshot.bsale_office_id,
          alertType
        );

        if (!hasPending) {
          const alertInput = createAlertInput(check);
          if (alertInput) {
            alertsToCreate.push(alertInput);
          }
        }
      }

      // Check for low velocity alert (only if not out of stock)
      if (snapshot && snapshot.quantity_available > 0 && threshold.days_warning > 0) {
        // Get historical snapshots for velocity calculation
        const historicalSnapshots = await deps.getHistoricalSnapshots(
          tenantId,
          variantId,
          threshold.bsale_office_id,
          VELOCITY_HISTORY_DAYS
        );

        const velocityCheck = checkVelocityAlert(
          historicalSnapshots,
          threshold.days_warning,
          snapshot.quantity_available
        );

        if (velocityCheck.shouldAlert && velocityCheck.daysToStockout !== null) {
          // Check if there's already a pending low_velocity alert
          const hasPendingVelocity = await deps.hasPendingAlert(
            userId,
            snapshot.bsale_variant_id,
            snapshot.bsale_office_id,
            "low_velocity"
          );

          if (!hasPendingVelocity) {
            const velocityAlertInput = createVelocityAlertInput(
              threshold,
              snapshot,
              velocityCheck.daysToStockout
            );
            alertsToCreate.push(velocityAlertInput);
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
