// tests/unit/billing/threshold-limit-service.test.ts
/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { describe, test, expect, mock } from "bun:test";
import { createThresholdLimitService } from "@/billing/threshold-limit-service";
import { PLANS } from "@/billing/plans";

describe("ThresholdLimitService", () => {
  const createMockDeps = (overrides: {
    userRepo?: {
      getById?: ReturnType<typeof mock>;
    };
    thresholdRepo?: {
      countByUserAcrossTenants?: ReturnType<typeof mock>;
      getActiveThresholdsForUser?: ReturnType<typeof mock>;
      getSkippedThresholdsForUser?: ReturnType<typeof mock>;
    };
  } = {}) => ({
    userRepo: {
      getById: mock(() => Promise.resolve(null)),
      ...overrides.userRepo,
    },
    thresholdRepo: {
      countByUserAcrossTenants: mock(() => Promise.resolve(0)),
      getActiveThresholdsForUser: mock(() => Promise.resolve([])),
      getSkippedThresholdsForUser: mock(() => Promise.resolve([])),
      ...overrides.thresholdRepo,
    },
  });

  describe("getUserLimitInfo", () => {
    test("returns FREE plan info for user without subscription", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          countByUserAcrossTenants: mock(() => Promise.resolve(25)),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getUserLimitInfo("user-1");

      expect(result).toEqual({
        plan: PLANS.FREE,
        currentCount: 25,
        maxAllowed: 50,
        remaining: 25,
        isOverLimit: false,
      });
    });

    test("returns PRO plan info for user with active subscription", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() =>
            Promise.resolve({ subscription_status: "active" })
          ),
        },
        thresholdRepo: {
          countByUserAcrossTenants: mock(() => Promise.resolve(100)),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getUserLimitInfo("user-1");

      expect(result).toEqual({
        plan: PLANS.PRO,
        currentCount: 100,
        maxAllowed: Infinity,
        remaining: Infinity,
        isOverLimit: false,
      });
    });

    test("returns isOverLimit true when free user exceeds 50", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          countByUserAcrossTenants: mock(() => Promise.resolve(60)),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getUserLimitInfo("user-1");

      expect(result.isOverLimit).toBe(true);
      expect(result.remaining).toBe(0);
    });

    test("throws error when user not found", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() => Promise.resolve(null)),
        },
      });
      const service = createThresholdLimitService(deps);

      const promise = service.getUserLimitInfo("nonexistent");
      await expect(promise).rejects.toThrow("User not found: nonexistent");
    });
  });

  describe("getActiveThresholdIds", () => {
    test("returns all threshold IDs for PRO user", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() =>
            Promise.resolve({ subscription_status: "active" })
          ),
        },
        thresholdRepo: {
          getActiveThresholdsForUser: mock(() =>
            Promise.resolve([{ id: "t1" }, { id: "t2" }, { id: "t3" }])
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getActiveThresholdIds("user-1");

      expect(result).toEqual(new Set(["t1", "t2", "t3"]));
      expect(deps.thresholdRepo.getActiveThresholdsForUser).toHaveBeenCalledWith(
        "user-1",
        undefined
      );
    });

    test("returns first 50 threshold IDs for FREE user", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          getActiveThresholdsForUser: mock(() =>
            Promise.resolve([{ id: "t1" }, { id: "t2" }])
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getActiveThresholdIds("user-1");

      expect(deps.thresholdRepo.getActiveThresholdsForUser).toHaveBeenCalledWith(
        "user-1",
        50
      );
      expect(result).toEqual(new Set(["t1", "t2"]));
    });

    test("throws error when user not found", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() => Promise.resolve(null)),
        },
      });
      const service = createThresholdLimitService(deps);

      const promise = service.getActiveThresholdIds("nonexistent");
      await expect(promise).rejects.toThrow("User not found: nonexistent");
    });
  });

  describe("getSkippedCount", () => {
    test("returns 0 for PRO user", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() =>
            Promise.resolve({ subscription_status: "active" })
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getSkippedCount("user-1");

      expect(result).toBe(0);
    });

    test("returns count of thresholds beyond 50 for FREE user", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          getSkippedThresholdsForUser: mock(() =>
            Promise.resolve([{ id: "t51" }, { id: "t52" }])
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getSkippedCount("user-1");

      expect(result).toBe(2);
      expect(deps.thresholdRepo.getSkippedThresholdsForUser).toHaveBeenCalledWith(
        "user-1",
        50
      );
    });

    test("throws error when user not found", async () => {
      const deps = createMockDeps({
        userRepo: {
          getById: mock(() => Promise.resolve(null)),
        },
      });
      const service = createThresholdLimitService(deps);

      const promise = service.getSkippedCount("nonexistent");
      await expect(promise).rejects.toThrow("User not found: nonexistent");
    });
  });
});
