import type { DailyConsumptionRepository } from "@/db/repositories/daily-consumption";

export interface VelocityCalculatorDeps {
  consumptionRepo: Pick<DailyConsumptionRepository, "get7DayAverage">;
}

export interface DaysLeftInput {
  tenantId: string;
  variantId: number;
  officeId: number | null;
  currentStock: number;
}

export interface DaysLeftResult {
  daysLeft: number;
  avgDailyConsumption: number;
  currentStock: number;
}

export interface DaysThresholdInput extends DaysLeftInput {
  minDays: number;
}

export function createVelocityCalculator(deps: VelocityCalculatorDeps) {
  return {
    async calculateDaysLeft(input: DaysLeftInput): Promise<DaysLeftResult> {
      const avgDailyConsumption = await deps.consumptionRepo.get7DayAverage(
        input.tenantId,
        input.variantId,
        input.officeId
      );

      const daysLeft =
        avgDailyConsumption > 0
          ? Math.floor(input.currentStock / avgDailyConsumption)
          : Infinity;

      return {
        daysLeft,
        avgDailyConsumption,
        currentStock: input.currentStock,
      };
    },

    async isBelowDaysThreshold(input: DaysThresholdInput): Promise<boolean> {
      const { daysLeft } = await this.calculateDaysLeft(input);
      return daysLeft < input.minDays;
    },

    async getVelocityInfo(input: DaysLeftInput): Promise<{
      daysLeft: number;
      avgDailyConsumption: number;
      weeklyConsumption: number;
      velocityTrend: "stable" | "increasing" | "decreasing";
    }> {
      const avgDailyConsumption = await deps.consumptionRepo.get7DayAverage(
        input.tenantId,
        input.variantId,
        input.officeId
      );

      const daysLeft =
        avgDailyConsumption > 0
          ? Math.floor(input.currentStock / avgDailyConsumption)
          : Infinity;

      // TODO: Calculate trend by comparing recent vs older averages
      const velocityTrend = "stable" as const;

      return {
        daysLeft,
        avgDailyConsumption,
        weeklyConsumption: avgDailyConsumption * 7,
        velocityTrend,
      };
    },
  };
}
