// src/billing/plans.ts
export interface Plan {
  readonly name: "FREE" | "PRO";
  readonly maxThresholds: number;
}

export const PLANS = {
  FREE: { name: "FREE", maxThresholds: 50 } as const,
  PRO: { name: "PRO", maxThresholds: Infinity } as const,
} as const;

export type PlanName = keyof typeof PLANS;

interface UserWithSubscription {
  subscription_status: string;
  subscription_ends_at?: Date | null;
}

export function getPlanForUser(user: UserWithSubscription): Plan {
  if (user.subscription_status === "active") {
    return PLANS.PRO;
  }
  if (user.subscription_status === "cancelled" && user.subscription_ends_at) {
    if (user.subscription_ends_at > new Date()) {
      return PLANS.PRO;
    }
  }
  return PLANS.FREE;
}

export function isUserPaid(user: UserWithSubscription): boolean {
  return getPlanForUser(user) === PLANS.PRO;
}
