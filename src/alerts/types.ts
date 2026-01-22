import type { StockSnapshot, Threshold, AlertInput } from "@/db/repositories/types";
import type { createVelocityCalculator } from "@/services/velocity-calculator";

export interface HasActiveOrDismissedResult {
  hasActive: boolean;
  hasDismissed: boolean;
}

export interface AlertGeneratorDependencies {
  getThresholdsByUser: (userId: string) => Promise<Threshold[]>;
  getStockSnapshot: (
    tenantId: string,
    variantId: number,
    officeId: number | null
  ) => Promise<StockSnapshot | null>;
  getHistoricalSnapshots: (
    tenantId: string,
    variantId: number,
    officeId: number | null,
    days: number
  ) => Promise<StockSnapshot[]>;
  hasPendingAlert: (
    userId: string,
    variantId: number,
    officeId: number | null,
    alertType: "low_stock" | "out_of_stock" | "low_velocity"
  ) => Promise<boolean>;
  createAlerts: (alerts: AlertInput[]) => Promise<number>;
  /** Optional velocity calculator for days-based thresholds */
  velocityCalculator?: ReturnType<typeof createVelocityCalculator>;
  /** Optional check for active or dismissed alerts (replaces hasPendingAlert when provided) */
  hasActiveOrDismissedAlert?: (
    tenantId: string,
    variantId: number,
    officeId: number | null,
    alertType: "low_stock" | "out_of_stock" | "low_velocity"
  ) => Promise<HasActiveOrDismissedResult>;
}

export interface AlertGenerationResult {
  userId: string;
  thresholdsChecked: number;
  alertsCreated: number;
  errors: string[];
}

export interface ThresholdCheck {
  threshold: Threshold;
  snapshot: StockSnapshot | null;
  shouldAlert: boolean;
  reason: string | null;
}
