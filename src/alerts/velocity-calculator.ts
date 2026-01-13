import type { StockSnapshot } from "@/db/repositories/types";

export type VelocityTrend = "fast_selling" | "slow_selling" | "stable" | "increasing";

export interface VelocityResult {
  dailyVelocity: number;
  daysToStockout: number | null;
  trend: VelocityTrend;
  dataPoints: number;
}

export interface VelocityAlertCheck {
  shouldAlert: boolean;
  daysToStockout: number | null;
  dailyVelocity: number;
  reason: string | null;
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  // Normalize to midnight
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return Math.abs(Math.round((d2.getTime() - d1.getTime()) / msPerDay));
}

/**
 * Determine the velocity trend based on daily velocity
 */
function determineTrend(dailyVelocity: number): VelocityTrend {
  if (dailyVelocity > 10) {
    return "fast_selling";
  }
  if (dailyVelocity > 0) {
    return "slow_selling";
  }
  if (dailyVelocity < 0) {
    return "increasing";
  }
  return "stable";
}

/**
 * Calculate sales velocity from historical snapshots
 *
 * @param snapshots - Array of snapshots ordered by date descending (most recent first)
 * @returns VelocityResult with daily velocity and days to stockout
 */
export function calculateVelocity(snapshots: StockSnapshot[]): VelocityResult {
  // Need at least 2 data points to calculate velocity
  if (snapshots.length < 2) {
    return {
      dailyVelocity: 0,
      daysToStockout: null,
      trend: "stable",
      dataPoints: snapshots.length,
    };
  }

  // Snapshots are ordered descending, so first is latest, last is oldest
  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const days = daysBetween(oldest.snapshot_date, latest.snapshot_date);

  // If all snapshots are on the same day, can't calculate velocity
  if (days === 0) {
    return {
      dailyVelocity: 0,
      daysToStockout: null,
      trend: "stable",
      dataPoints: snapshots.length,
    };
  }

  // Positive velocity = selling stock (oldest quantity > latest quantity)
  // Negative velocity = gaining stock (oldest quantity < latest quantity)
  const dailyVelocity = (oldest.quantity_available - latest.quantity_available) / days;

  // Calculate days until zero stock (only if selling)
  let daysToStockout: number | null = null;
  if (dailyVelocity > 0 && latest.quantity_available > 0) {
    daysToStockout = Math.round((latest.quantity_available / dailyVelocity) * 10) / 10;
  }

  return {
    dailyVelocity: Math.round(dailyVelocity * 100) / 100,
    daysToStockout,
    trend: determineTrend(dailyVelocity),
    dataPoints: snapshots.length,
  };
}

/**
 * Check if a low velocity alert should be triggered
 *
 * @param snapshots - Historical snapshots for velocity calculation
 * @param daysWarning - Threshold for days to stockout (alert if below this)
 * @param currentQuantity - Current stock quantity
 * @returns VelocityAlertCheck with alert decision and details
 */
export function checkVelocityAlert(
  snapshots: StockSnapshot[],
  daysWarning: number | null,
  currentQuantity: number
): VelocityAlertCheck {
  // If days_warning is not set, skip velocity check
  if (daysWarning === null || daysWarning === 0) {
    return {
      shouldAlert: false,
      daysToStockout: null,
      dailyVelocity: 0,
      reason: "days_warning not configured",
    };
  }

  // If already out of stock, skip velocity check (out_of_stock alert should fire instead)
  if (currentQuantity <= 0) {
    return {
      shouldAlert: false,
      daysToStockout: 0,
      dailyVelocity: 0,
      reason: "Product already out of stock",
    };
  }

  const velocityResult = calculateVelocity(snapshots);

  // Not enough data to calculate velocity
  if (velocityResult.dataPoints < 2) {
    return {
      shouldAlert: false,
      daysToStockout: null,
      dailyVelocity: 0,
      reason: "Insufficient historical data (need at least 2 days)",
    };
  }

  // Stock is increasing or stable, no need for alert
  if (velocityResult.dailyVelocity <= 0) {
    return {
      shouldAlert: false,
      daysToStockout: null,
      dailyVelocity: velocityResult.dailyVelocity,
      reason: "Stock is stable or increasing",
    };
  }

  // No stockout prediction available
  if (velocityResult.daysToStockout === null) {
    return {
      shouldAlert: false,
      daysToStockout: null,
      dailyVelocity: velocityResult.dailyVelocity,
      reason: "Unable to calculate days to stockout",
    };
  }

  // Check if days to stockout is below threshold
  if (velocityResult.daysToStockout < daysWarning) {
    return {
      shouldAlert: true,
      daysToStockout: velocityResult.daysToStockout,
      dailyVelocity: velocityResult.dailyVelocity,
      reason: `Days to stockout (${String(velocityResult.daysToStockout)}) is below warning threshold (${String(daysWarning)})`,
    };
  }

  return {
    shouldAlert: false,
    daysToStockout: velocityResult.daysToStockout,
    dailyVelocity: velocityResult.dailyVelocity,
    reason: null,
  };
}
