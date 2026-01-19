// tests/unit/billing/plans.test.ts
import { describe, test, expect } from "bun:test";
import { PLANS, getPlanForUser } from "@/billing/plans";

describe("Plans", () => {
  describe("PLANS constant", () => {
    test("FREE plan has 50 threshold limit", () => {
      expect(PLANS.FREE.maxThresholds).toBe(50);
    });

    test("PRO plan has unlimited thresholds", () => {
      expect(PLANS.PRO.maxThresholds).toBe(Infinity);
    });
  });

  describe("getPlanForUser", () => {
    test("returns FREE for user with no subscription", () => {
      const user = { subscription_status: "none" } as { subscription_status: string };
      expect(getPlanForUser(user)).toBe(PLANS.FREE);
    });

    test("returns PRO for user with active subscription", () => {
      const user = { subscription_status: "active" } as { subscription_status: string };
      expect(getPlanForUser(user)).toBe(PLANS.PRO);
    });

    test("returns PRO for cancelled user within grace period", () => {
      const user = {
        subscription_status: "cancelled",
        subscription_ends_at: new Date(Date.now() + 86400000), // tomorrow
      } as { subscription_status: string; subscription_ends_at: Date | null };
      expect(getPlanForUser(user)).toBe(PLANS.PRO);
    });

    test("returns FREE for cancelled user past grace period", () => {
      const user = {
        subscription_status: "cancelled",
        subscription_ends_at: new Date(Date.now() - 86400000), // yesterday
      } as { subscription_status: string; subscription_ends_at: Date | null };
      expect(getPlanForUser(user)).toBe(PLANS.FREE);
    });
  });
});
