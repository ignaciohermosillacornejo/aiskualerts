import type { StockSnapshot, Threshold, AlertInput } from "@/db/repositories/types";

export interface AlertGeneratorDependencies {
  getThresholdsByUser: (userId: string) => Promise<Threshold[]>;
  getStockSnapshot: (
    tenantId: string,
    variantId: number,
    officeId: number | null
  ) => Promise<StockSnapshot | null>;
  hasPendingAlert: (
    userId: string,
    variantId: number,
    officeId: number | null,
    alertType: "threshold_breach" | "low_velocity"
  ) => Promise<boolean>;
  createAlerts: (alerts: AlertInput[]) => Promise<number>;
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
