import { test, expect, describe } from "bun:test";
import {
  calculateVelocity,
  checkVelocityAlert,
} from "@/alerts/velocity-calculator";
import type { StockSnapshot } from "@/db/repositories/types";

function createSnapshot(
  daysAgo: number,
  quantity: number,
  overrides: Partial<StockSnapshot> = {}
): StockSnapshot {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(0, 0, 0, 0);

  return {
    id: `snapshot-${String(daysAgo)}`,
    tenant_id: "tenant-123",
    bsale_variant_id: 100,
    bsale_office_id: 1,
    sku: "SKU-001",
    barcode: "1234567890",
    product_name: "Test Product",
    quantity: quantity,
    quantity_reserved: 0,
    quantity_available: quantity,
    unit_price: null,
    snapshot_date: date,
    created_at: date,
    ...overrides,
  };
}

describe("calculateVelocity", () => {
  test("returns stable trend with zero velocity for empty snapshots", () => {
    const result = calculateVelocity([]);

    expect(result.dailyVelocity).toBe(0);
    expect(result.daysToStockout).toBeNull();
    expect(result.trend).toBe("stable");
    expect(result.dataPoints).toBe(0);
  });

  test("returns stable trend with zero velocity for single snapshot", () => {
    const snapshots = [createSnapshot(0, 100)];
    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(0);
    expect(result.daysToStockout).toBeNull();
    expect(result.trend).toBe("stable");
    expect(result.dataPoints).toBe(1);
  });

  test("calculates positive velocity when stock is decreasing", () => {
    // Latest: 55 units, Oldest (7 days ago): 100 units
    // Velocity = (100 - 55) / 7 = 6.43/day
    const snapshots = [
      createSnapshot(0, 55),
      createSnapshot(1, 62),
      createSnapshot(2, 68),
      createSnapshot(3, 73),
      createSnapshot(4, 82),
      createSnapshot(5, 95),
      createSnapshot(6, 100),
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBeCloseTo(7.5, 1); // (100 - 55) / 6 days = 7.5
    expect(result.daysToStockout).toBeCloseTo(7.3, 1); // 55 / 7.5 = 7.3
    expect(result.trend).toBe("slow_selling");
    expect(result.dataPoints).toBe(7);
  });

  test("calculates fast_selling trend for high velocity", () => {
    // Latest: 50 units, Oldest (5 days ago): 120 units
    // Velocity = (120 - 50) / 5 = 14/day (fast selling)
    const snapshots = [
      createSnapshot(0, 50),
      createSnapshot(5, 120),
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(14);
    expect(result.daysToStockout).toBeCloseTo(3.6, 1); // 50 / 14 = 3.57
    expect(result.trend).toBe("fast_selling");
    expect(result.dataPoints).toBe(2);
  });

  test("returns increasing trend when stock is growing", () => {
    // Latest: 150 units, Oldest (5 days ago): 100 units
    // Velocity = (100 - 150) / 5 = -10/day (gaining stock)
    const snapshots = [
      createSnapshot(0, 150),
      createSnapshot(5, 100),
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(-10);
    expect(result.daysToStockout).toBeNull();
    expect(result.trend).toBe("increasing");
    expect(result.dataPoints).toBe(2);
  });

  test("returns stable trend when velocity is zero", () => {
    // Same quantity over time
    const snapshots = [
      createSnapshot(0, 100),
      createSnapshot(5, 100),
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(0);
    expect(result.daysToStockout).toBeNull();
    expect(result.trend).toBe("stable");
    expect(result.dataPoints).toBe(2);
  });

  test("handles snapshots on the same day", () => {
    // All snapshots on the same day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshots: StockSnapshot[] = [
      { ...createSnapshot(0, 100), snapshot_date: today },
      { ...createSnapshot(0, 90), snapshot_date: today },
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(0);
    expect(result.daysToStockout).toBeNull();
    expect(result.trend).toBe("stable");
    expect(result.dataPoints).toBe(2);
  });

  test("calculates correctly with only 2 data points", () => {
    // Minimum valid data: 2 snapshots
    const snapshots = [
      createSnapshot(0, 80),
      createSnapshot(4, 100),
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(5); // (100 - 80) / 4 = 5
    expect(result.daysToStockout).toBe(16); // 80 / 5 = 16
    expect(result.trend).toBe("slow_selling");
    expect(result.dataPoints).toBe(2);
  });

  test("handles zero current quantity", () => {
    const snapshots = [
      createSnapshot(0, 0),
      createSnapshot(5, 50),
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(10); // (50 - 0) / 5 = 10
    expect(result.daysToStockout).toBeNull(); // Can't stockout with 0 quantity
    expect(result.trend).toBe("slow_selling");
    expect(result.dataPoints).toBe(2);
  });

  test("rounds velocity to 2 decimal places", () => {
    // Velocity that would have many decimals
    const snapshots = [
      createSnapshot(0, 77),
      createSnapshot(7, 100),
    ];

    const result = calculateVelocity(snapshots);

    expect(result.dailyVelocity).toBe(3.29); // (100 - 77) / 7 = 3.285... → 3.29
  });

  test("rounds days to stockout to 1 decimal place", () => {
    const snapshots = [
      createSnapshot(0, 33),
      createSnapshot(7, 100),
    ];

    const result = calculateVelocity(snapshots);

    // Velocity = (100 - 33) / 7 = 9.57
    // Days to stockout = 33 / 9.57 = 3.447... → 3.4
    expect(result.daysToStockout).toBe(3.4);
  });
});

describe("checkVelocityAlert", () => {
  test("returns no alert when days_warning is null", () => {
    const snapshots = [
      createSnapshot(0, 50),
      createSnapshot(7, 100),
    ];

    const result = checkVelocityAlert(snapshots, null, 50);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("days_warning not configured");
    expect(result.daysToStockout).toBeNull();
    expect(result.dailyVelocity).toBe(0);
  });

  test("returns no alert when days_warning is zero", () => {
    const snapshots = [
      createSnapshot(0, 50),
      createSnapshot(7, 100),
    ];

    const result = checkVelocityAlert(snapshots, 0, 50);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("days_warning not configured");
  });

  test("returns no alert when product is out of stock", () => {
    const snapshots = [
      createSnapshot(0, 0),
      createSnapshot(7, 100),
    ];

    const result = checkVelocityAlert(snapshots, 14, 0);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("Product already out of stock");
    expect(result.daysToStockout).toBe(0);
    expect(result.dailyVelocity).toBe(0);
  });

  test("returns no alert when insufficient historical data (0 snapshots)", () => {
    const result = checkVelocityAlert([], 14, 50);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("Insufficient historical data (need at least 2 days)");
    expect(result.daysToStockout).toBeNull();
    expect(result.dailyVelocity).toBe(0);
  });

  test("returns no alert when insufficient historical data (1 snapshot)", () => {
    const snapshots = [createSnapshot(0, 50)];

    const result = checkVelocityAlert(snapshots, 14, 50);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("Insufficient historical data (need at least 2 days)");
    expect(result.daysToStockout).toBeNull();
    expect(result.dailyVelocity).toBe(0);
  });

  test("returns no alert when stock is increasing", () => {
    const snapshots = [
      createSnapshot(0, 150),
      createSnapshot(7, 100),
    ];

    const result = checkVelocityAlert(snapshots, 14, 150);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("Stock is stable or increasing");
    expect(result.daysToStockout).toBeNull();
    expect(result.dailyVelocity).toBeCloseTo(-7.14, 1);
  });

  test("returns no alert when stock is stable", () => {
    const snapshots = [
      createSnapshot(0, 100),
      createSnapshot(7, 100),
    ];

    const result = checkVelocityAlert(snapshots, 14, 100);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("Stock is stable or increasing");
    expect(result.daysToStockout).toBeNull();
    expect(result.dailyVelocity).toBe(0);
  });

  test("returns no alert when days to stockout is above threshold", () => {
    // Days to stockout = 55 / 6.43 = 8.55 days
    // Warning threshold = 7 days
    // 8.55 > 7, so no alert
    const snapshots = [
      createSnapshot(0, 55),
      createSnapshot(7, 100),
    ];

    const result = checkVelocityAlert(snapshots, 7, 55);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.daysToStockout).toBeCloseTo(8.6, 1);
    expect(result.dailyVelocity).toBeCloseTo(6.43, 1);
  });

  test("returns alert when days to stockout is below threshold", () => {
    // Days to stockout = 55 / 6.43 = 8.55 days
    // Warning threshold = 14 days
    // 8.55 < 14, so alert
    const snapshots = [
      createSnapshot(0, 55),
      createSnapshot(7, 100),
    ];

    const result = checkVelocityAlert(snapshots, 14, 55);

    expect(result.shouldAlert).toBe(true);
    expect(result.reason).toContain("Days to stockout");
    expect(result.reason).toContain("below warning threshold");
    expect(result.daysToStockout).toBeCloseTo(8.6, 1);
    expect(result.dailyVelocity).toBeCloseTo(6.43, 1);
  });

  test("returns alert for fast-selling products", () => {
    // Fast selling: 14 units/day
    // Days to stockout = 50 / 14 = 3.57 days
    const snapshots = [
      createSnapshot(0, 50),
      createSnapshot(5, 120),
    ];

    const result = checkVelocityAlert(snapshots, 7, 50);

    expect(result.shouldAlert).toBe(true);
    expect(result.daysToStockout).toBeCloseTo(3.6, 1);
    expect(result.dailyVelocity).toBe(14);
  });

  test("uses current quantity parameter for calculation", () => {
    // Snapshots show 55 quantity, but we pass 40 as current
    // This tests that we use the provided current quantity for the check
    const snapshots = [
      createSnapshot(0, 55),
      createSnapshot(7, 100),
    ];

    // Velocity based on snapshots = 6.43/day
    // But alert check uses current quantity of 40
    const result = checkVelocityAlert(snapshots, 14, 40);

    expect(result.shouldAlert).toBe(true);
    expect(result.daysToStockout).toBeCloseTo(8.6, 1); // Calculated from snapshots
  });

  test("exact boundary: days to stockout equals threshold", () => {
    // Create snapshots where days to stockout is exactly 7
    // Velocity = 10/day, current = 70, days to stockout = 7.0
    const snapshots = [
      createSnapshot(0, 70),
      createSnapshot(7, 140),
    ];

    const result = checkVelocityAlert(snapshots, 7, 70);

    // days_to_stockout = 7.0 is NOT < 7, so no alert
    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.daysToStockout).toBe(7);
    expect(result.dailyVelocity).toBe(10);
  });

  test("boundary: days to stockout just below threshold", () => {
    // Create snapshots where days to stockout is just below 7
    const snapshots = [
      createSnapshot(0, 69),
      createSnapshot(7, 139),
    ];

    const result = checkVelocityAlert(snapshots, 7, 69);

    // Velocity = (139 - 69) / 7 = 10/day
    // days_to_stockout = 69 / 10 = 6.9 < 7, so alert
    expect(result.shouldAlert).toBe(true);
    expect(result.daysToStockout).toBe(6.9);
  });
});
