import { describe, test, expect, mock } from "bun:test";
import { createVelocityCalculator } from "@/services/velocity-calculator";
import type { DailyConsumptionRepository } from "@/db/repositories/daily-consumption";

// Helper to create a mock consumption repository
function createMockConsumptionRepo(
  get7DayAverageReturn: number
): Pick<DailyConsumptionRepository, "get7DayAverage"> {
  return {
    get7DayAverage: mock(() => Promise.resolve(get7DayAverageReturn)),
  };
}

describe("createVelocityCalculator", () => {
  describe("calculateDaysLeft", () => {
    test("calculates days left based on stock and consumption (50 stock / 10 consumption = 5 days)", async () => {
      const mockRepo = createMockConsumptionRepo(10);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.calculateDaysLeft({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 50,
      });

      expect(result.daysLeft).toBe(5);
      expect(result.avgDailyConsumption).toBe(10);
      expect(result.currentStock).toBe(50);
      expect(mockRepo.get7DayAverage).toHaveBeenCalledWith(
        "tenant-123",
        100,
        1
      );
    });

    test("returns Infinity when no consumption (0 avg)", async () => {
      const mockRepo = createMockConsumptionRepo(0);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.calculateDaysLeft({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: null,
        currentStock: 50,
      });

      expect(result.daysLeft).toBe(Infinity);
      expect(result.avgDailyConsumption).toBe(0);
      expect(result.currentStock).toBe(50);
    });

    test("handles null officeId", async () => {
      const mockRepo = createMockConsumptionRepo(5);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.calculateDaysLeft({
        tenantId: "tenant-456",
        variantId: 200,
        officeId: null,
        currentStock: 100,
      });

      expect(result.daysLeft).toBe(20);
      expect(mockRepo.get7DayAverage).toHaveBeenCalledWith(
        "tenant-456",
        200,
        null
      );
    });

    test("uses Math.floor for daysLeft calculation", async () => {
      const mockRepo = createMockConsumptionRepo(7);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.calculateDaysLeft({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 50,
      });

      // 50 / 7 = 7.14..., should floor to 7
      expect(result.daysLeft).toBe(7);
    });
  });

  describe("isBelowDaysThreshold", () => {
    test("returns true when days left < minDays", async () => {
      const mockRepo = createMockConsumptionRepo(10);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.isBelowDaysThreshold({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 50,
        minDays: 7, // 50/10 = 5 days left, 5 < 7
      });

      expect(result).toBe(true);
    });

    test("returns false when days left >= minDays", async () => {
      const mockRepo = createMockConsumptionRepo(5);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.isBelowDaysThreshold({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 50,
        minDays: 7, // 50/5 = 10 days left, 10 >= 7
      });

      expect(result).toBe(false);
    });

    test("returns false when days left equals minDays", async () => {
      const mockRepo = createMockConsumptionRepo(10);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.isBelowDaysThreshold({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 50,
        minDays: 5, // 50/10 = 5 days left, 5 is not < 5
      });

      expect(result).toBe(false);
    });

    test("returns false when no consumption (Infinity days left)", async () => {
      const mockRepo = createMockConsumptionRepo(0);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.isBelowDaysThreshold({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: null,
        currentStock: 50,
        minDays: 14,
      });

      expect(result).toBe(false); // Infinity is not < 14
    });
  });

  describe("getVelocityInfo", () => {
    test("returns full velocity info with weekly consumption", async () => {
      const mockRepo = createMockConsumptionRepo(10);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.getVelocityInfo({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 50,
      });

      expect(result.daysLeft).toBe(5);
      expect(result.avgDailyConsumption).toBe(10);
      expect(result.weeklyConsumption).toBe(70);
      expect(result.velocityTrend).toBe("stable");
    });

    test("returns Infinity for daysLeft when no consumption", async () => {
      const mockRepo = createMockConsumptionRepo(0);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.getVelocityInfo({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: null,
        currentStock: 100,
      });

      expect(result.daysLeft).toBe(Infinity);
      expect(result.avgDailyConsumption).toBe(0);
      expect(result.weeklyConsumption).toBe(0);
      expect(result.velocityTrend).toBe("stable");
    });

    test("calculates weekly consumption correctly for fractional daily consumption", async () => {
      const mockRepo = createMockConsumptionRepo(2.5);
      const calculator = createVelocityCalculator({ consumptionRepo: mockRepo });

      const result = await calculator.getVelocityInfo({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 25,
      });

      expect(result.avgDailyConsumption).toBe(2.5);
      expect(result.weeklyConsumption).toBe(17.5);
      expect(result.daysLeft).toBe(10); // Math.floor(25 / 2.5) = 10
    });
  });
});
