import type { AlertInput, Threshold, StockSnapshot } from "@/db/repositories/types";
import type {
  AlertGeneratorDependencies,
  AlertGenerationResult,
  ThresholdCheck,
  HasActiveOrDismissedResult,
} from "./types";
import { checkVelocityAlert } from "./velocity-calculator";

const VELOCITY_HISTORY_DAYS = 7;

/**
 * Check if an alert should be skipped based on active/dismissed status
 * Returns true if the alert should be skipped
 */
async function shouldSkipAlert(
  deps: AlertGeneratorDependencies,
  tenantId: string,
  userId: string,
  variantId: number,
  officeId: number | null,
  alertType: "low_stock" | "out_of_stock" | "low_velocity"
): Promise<boolean> {
  // Use hasActiveOrDismissedAlert if provided (new behavior)
  if (deps.hasActiveOrDismissedAlert) {
    const result: HasActiveOrDismissedResult = await deps.hasActiveOrDismissedAlert(
      tenantId,
      variantId,
      officeId,
      alertType
    );
    return result.hasActive || result.hasDismissed;
  }

  // Fall back to hasPendingAlert (backwards compatibility)
  return deps.hasPendingAlert(userId, variantId, officeId, alertType);
}

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

      // Handle days-based thresholds
      if (threshold.threshold_type === "days" && threshold.min_days !== null) {
        // Days-based threshold: use velocity calculator
        if (snapshot && snapshot.quantity_available > 0 && deps.velocityCalculator) {
          const velocityResult = await deps.velocityCalculator.calculateDaysLeft({
            tenantId,
            variantId,
            officeId: threshold.bsale_office_id,
            currentStock: snapshot.quantity_available,
          });

          // Check if days left is below the min_days threshold
          if (velocityResult.daysLeft < threshold.min_days) {
            // Check if we should skip (active or dismissed)
            const skipAlert = await shouldSkipAlert(
              deps,
              tenantId,
              userId,
              snapshot.bsale_variant_id,
              snapshot.bsale_office_id,
              "low_velocity"
            );

            if (!skipAlert) {
              const velocityAlertInput = createVelocityAlertInput(
                threshold,
                snapshot,
                velocityResult.daysLeft
              );
              alertsToCreate.push(velocityAlertInput);
            }
          }
        }
        // Skip quantity check for days-based thresholds
        continue;
      }

      // Handle quantity-based thresholds (explicit check for threshold_type === "quantity")
      const check = checkThresholdBreach(threshold, snapshot);

      if (check.shouldAlert && check.snapshot) {
        // Determine alert type for pending check
        const alertType =
          check.snapshot.quantity_available === 0
            ? "out_of_stock"
            : "low_stock";

        // Check if we should skip (active, pending, or dismissed)
        const skipAlert = await shouldSkipAlert(
          deps,
          tenantId,
          userId,
          check.snapshot.bsale_variant_id,
          check.snapshot.bsale_office_id,
          alertType
        );

        if (!skipAlert) {
          const alertInput = createAlertInput(check);
          if (alertInput) {
            alertsToCreate.push(alertInput);
          }
        }
      }

      // Check for low velocity alert (only if not out of stock)
      // This is for quantity-based thresholds with days_warning set
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
          // Check if we should skip (active, pending, or dismissed)
          const skipVelocityAlert = await shouldSkipAlert(
            deps,
            tenantId,
            userId,
            snapshot.bsale_variant_id,
            snapshot.bsale_office_id,
            "low_velocity"
          );

          if (!skipVelocityAlert) {
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
