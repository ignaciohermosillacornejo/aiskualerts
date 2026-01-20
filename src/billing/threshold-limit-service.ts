// src/billing/threshold-limit-service.ts
import { getPlanForUser, type Plan } from "./plans";
import type { UserRepository } from "@/db/repositories/user";
import type { ThresholdRepository } from "@/db/repositories/threshold";

export interface LimitInfo {
  plan: Plan;
  currentCount: number;
  maxAllowed: number;
  remaining: number;
  isOverLimit: boolean;
}

export interface ThresholdLimitServiceDeps {
  userRepo: Pick<UserRepository, "getById">;
  thresholdRepo: Pick<
    ThresholdRepository,
    "countByUserAcrossTenants" | "getActiveThresholdsForUser" | "getSkippedThresholdsForUser"
  >;
}

export interface ThresholdLimitService {
  getUserLimitInfo(userId: string): Promise<LimitInfo>;
  getActiveThresholdIds(userId: string): Promise<Set<string>>;
  getSkippedCount(userId: string): Promise<number>;
}

export function createThresholdLimitService(
  deps: ThresholdLimitServiceDeps
): ThresholdLimitService {
  const { userRepo, thresholdRepo } = deps;

  return {
    async getUserLimitInfo(userId: string): Promise<LimitInfo> {
      const user = await userRepo.getById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const plan = getPlanForUser(user);
      const currentCount = await thresholdRepo.countByUserAcrossTenants(userId);
      const maxAllowed = plan.maxThresholds;
      const isOverLimit = currentCount > maxAllowed;
      const remaining = isOverLimit ? 0 : maxAllowed - currentCount;

      return {
        plan,
        currentCount,
        maxAllowed,
        remaining: maxAllowed === Infinity ? Infinity : remaining,
        isOverLimit,
      };
    },

    async getActiveThresholdIds(userId: string): Promise<Set<string>> {
      const user = await userRepo.getById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const plan = getPlanForUser(user);
      const limit = plan.maxThresholds === Infinity ? undefined : plan.maxThresholds;
      const thresholds = await thresholdRepo.getActiveThresholdsForUser(userId, limit);

      return new Set(thresholds.map((t) => t.id));
    },

    async getSkippedCount(userId: string): Promise<number> {
      const user = await userRepo.getById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const plan = getPlanForUser(user);
      if (plan.maxThresholds === Infinity) {
        return 0;
      }

      const skipped = await thresholdRepo.getSkippedThresholdsForUser(
        userId,
        plan.maxThresholds
      );
      return skipped.length;
    },
  };
}
