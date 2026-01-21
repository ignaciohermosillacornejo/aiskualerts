import { test, expect, describe, mock } from "bun:test";
import {
  checkThresholdBreach,
  createAlertInput,
  createVelocityAlertInput,
  generateAlertsForUser,
} from "@/alerts/alert-generator";
import type { Threshold, StockSnapshot, AlertInput } from "@/db/repositories/types";
import type { AlertGeneratorDependencies } from "@/alerts/types";

const mockThreshold: Threshold = {
  id: "threshold-123",
  tenant_id: "tenant-123",
  user_id: "user-456",
  created_by: "user-456",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  min_quantity: 10,
  days_warning: 7,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockSnapshot: StockSnapshot = {
  id: "snapshot-123",
  tenant_id: "tenant-123",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  sku: "SKU-001",
  barcode: "1234567890",
  product_name: "Test Product",
  quantity: 5,
  quantity_reserved: 0,
  quantity_available: 5,
  unit_price: null,
  snapshot_date: new Date(),
  created_at: new Date(),
};

describe("checkThresholdBreach", () => {
  test("returns shouldAlert false when no snapshot", () => {
    const result = checkThresholdBreach(mockThreshold, null);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBe("No stock snapshot found");
    expect(result.snapshot).toBeNull();
  });

  test("returns shouldAlert true when stock below threshold", () => {
    const lowStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 5,
    };

    const result = checkThresholdBreach(mockThreshold, lowStockSnapshot);

    expect(result.shouldAlert).toBe(true);
    expect(result.reason).toBe("Stock 5 is below threshold 10");
    expect(result.snapshot).toEqual(lowStockSnapshot);
  });

  test("returns shouldAlert false when stock equals threshold", () => {
    const atThresholdSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 10,
    };

    const result = checkThresholdBreach(mockThreshold, atThresholdSnapshot);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBeNull();
  });

  test("returns shouldAlert false when stock above threshold", () => {
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 50,
    };

    const result = checkThresholdBreach(mockThreshold, highStockSnapshot);

    expect(result.shouldAlert).toBe(false);
    expect(result.reason).toBeNull();
  });
});

describe("createAlertInput", () => {
  test("returns null when shouldAlert is false", () => {
    const check = {
      threshold: mockThreshold,
      snapshot: mockSnapshot,
      shouldAlert: false,
      reason: null,
    };

    const result = createAlertInput(check);

    expect(result).toBeNull();
  });

  test("returns null when snapshot is null", () => {
    const check = {
      threshold: mockThreshold,
      snapshot: null,
      shouldAlert: true,
      reason: "test",
    };

    const result = createAlertInput(check);

    expect(result).toBeNull();
  });

  test("creates AlertInput with low_stock type when stock is low but not zero", () => {
    const lowStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 5,
    };
    const check = {
      threshold: mockThreshold,
      snapshot: lowStockSnapshot,
      shouldAlert: true,
      reason: "Stock 5 is below threshold 10",
    };

    const result = createAlertInput(check);

    expect(result).not.toBeNull();
    expect(result?.tenant_id).toBe("tenant-123");
    expect(result?.user_id).toBe("user-456");
    expect(result?.bsale_variant_id).toBe(100);
    expect(result?.bsale_office_id).toBe(1);
    expect(result?.sku).toBe("SKU-001");
    expect(result?.product_name).toBe("Test Product");
    expect(result?.alert_type).toBe("low_stock");
    expect(result?.current_quantity).toBe(5);
    expect(result?.threshold_quantity).toBe(10);
    expect(result?.days_to_stockout).toBeNull();
  });

  test("creates AlertInput with out_of_stock type when quantity is zero", () => {
    const outOfStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 0,
    };
    const check = {
      threshold: mockThreshold,
      snapshot: outOfStockSnapshot,
      shouldAlert: true,
      reason: "Stock 0 is below threshold 10",
    };

    const result = createAlertInput(check);

    expect(result).not.toBeNull();
    expect(result?.tenant_id).toBe("tenant-123");
    expect(result?.user_id).toBe("user-456");
    expect(result?.bsale_variant_id).toBe(100);
    expect(result?.bsale_office_id).toBe(1);
    expect(result?.sku).toBe("SKU-001");
    expect(result?.product_name).toBe("Test Product");
    expect(result?.alert_type).toBe("out_of_stock");
    expect(result?.current_quantity).toBe(0);
    expect(result?.threshold_quantity).toBe(10);
    expect(result?.days_to_stockout).toBeNull();
  });
});

describe("createVelocityAlertInput", () => {
  test("creates AlertInput with low_velocity type", () => {
    const result = createVelocityAlertInput(mockThreshold, mockSnapshot, 5.5);

    expect(result.tenant_id).toBe("tenant-123");
    expect(result.user_id).toBe("user-456");
    expect(result.bsale_variant_id).toBe(100);
    expect(result.bsale_office_id).toBe(1);
    expect(result.sku).toBe("SKU-001");
    expect(result.product_name).toBe("Test Product");
    expect(result.alert_type).toBe("low_velocity");
    expect(result.current_quantity).toBe(5);
    expect(result.threshold_quantity).toBeNull();
    expect(result.days_to_stockout).toBe(5.5);
  });

  test("handles null office_id", () => {
    const snapshotWithNullOffice: StockSnapshot = {
      ...mockSnapshot,
      bsale_office_id: null,
    };
    const thresholdWithNullOffice: Threshold = {
      ...mockThreshold,
      bsale_office_id: null,
    };

    const result = createVelocityAlertInput(
      thresholdWithNullOffice,
      snapshotWithNullOffice,
      10
    );

    expect(result.bsale_office_id).toBeNull();
    expect(result.days_to_stockout).toBe(10);
  });
});

describe("generateAlertsForUser", () => {
  interface MockOverrides {
    getThresholdsByUser?: ReturnType<typeof mock>;
    getStockSnapshot?: ReturnType<typeof mock>;
    getHistoricalSnapshots?: ReturnType<typeof mock>;
    hasPendingAlert?: ReturnType<typeof mock>;
    createAlerts?: ReturnType<typeof mock>;
  }

  interface MockDepsResult {
    deps: AlertGeneratorDependencies;
    mocks: {
      getThresholdsByUser: ReturnType<typeof mock>;
      getStockSnapshot: ReturnType<typeof mock>;
      getHistoricalSnapshots: ReturnType<typeof mock>;
      hasPendingAlert: ReturnType<typeof mock>;
      createAlerts: ReturnType<typeof mock>;
    };
  }

  function createMockDeps(overrides: MockOverrides = {}): MockDepsResult {
    const getThresholdsByUser =
      overrides.getThresholdsByUser ?? mock(() => Promise.resolve([] as Threshold[]));
    const getStockSnapshot =
      overrides.getStockSnapshot ?? mock(() => Promise.resolve(null as StockSnapshot | null));
    const getHistoricalSnapshots =
      overrides.getHistoricalSnapshots ?? mock(() => Promise.resolve([] as StockSnapshot[]));
    const hasPendingAlert = overrides.hasPendingAlert ?? mock(() => Promise.resolve(false));
    const createAlerts = overrides.createAlerts ?? mock(() => Promise.resolve(0));

    const mocks = {
      getThresholdsByUser,
      getStockSnapshot,
      getHistoricalSnapshots,
      hasPendingAlert,
      createAlerts,
    };

    return {
      deps: mocks as unknown as AlertGeneratorDependencies,
      mocks,
    };
  }

  function createHistoricalSnapshot(daysAgo: number, quantity: number): StockSnapshot {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return {
      ...mockSnapshot,
      quantity_available: quantity,
      snapshot_date: date,
    };
  }

  test("returns empty result when no thresholds", async () => {
    const { deps, mocks } = createMockDeps();

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.userId).toBe("user-456");
    expect(result.thresholdsChecked).toBe(0);
    expect(result.alertsCreated).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mocks.getThresholdsByUser).toHaveBeenCalledWith("user-456");
  });

  test("handles threshold fetch error", async () => {
    const { deps } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.reject(new Error("DB error"))),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.errors).toContain("Failed to get thresholds: DB error");
    expect(result.thresholdsChecked).toBe(0);
  });

  test("skips global thresholds (variant_id is null)", async () => {
    const globalThreshold: Threshold = {
      ...mockThreshold,
      bsale_variant_id: null,
    };
    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([globalThreshold])),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
    expect(mocks.getStockSnapshot).not.toHaveBeenCalled();
  });

  test("creates alert when stock below threshold", async () => {
    const lowStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 5,
    };
    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([mockThreshold])),
      getStockSnapshot: mock(() => Promise.resolve(lowStockSnapshot)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
      createAlerts: mock(() => Promise.resolve(1)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(1);
    expect(mocks.createAlerts).toHaveBeenCalled();
  });

  test("does not create alert when pending alert exists", async () => {
    const lowStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 5,
    };
    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([mockThreshold])),
      getStockSnapshot: mock(() => Promise.resolve(lowStockSnapshot)),
      hasPendingAlert: mock(() => Promise.resolve(true)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
    expect(mocks.createAlerts).not.toHaveBeenCalled();
  });

  test("does not create alert when stock above threshold", async () => {
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 50,
    };
    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([mockThreshold])),
      getStockSnapshot: mock(() => Promise.resolve(highStockSnapshot)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
    expect(mocks.createAlerts).not.toHaveBeenCalled();
  });

  test("handles snapshot fetch error", async () => {
    const { deps } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([mockThreshold])),
      getStockSnapshot: mock(() => Promise.reject(new Error("Snapshot error"))),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Snapshot error");
  });

  test("handles alert creation error", async () => {
    const lowStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 5,
    };
    const { deps } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([mockThreshold])),
      getStockSnapshot: mock(() => Promise.resolve(lowStockSnapshot)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
      createAlerts: mock(() => Promise.reject(new Error("Creation failed"))),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.alertsCreated).toBe(0);
    expect(result.errors).toContain("Failed to create alerts: Creation failed");
  });

  test("processes multiple thresholds", async () => {
    const threshold1 = { ...mockThreshold, id: "t1", bsale_variant_id: 100 };
    const threshold2 = { ...mockThreshold, id: "t2", bsale_variant_id: 200 };
    const lowSnapshot = { ...mockSnapshot, quantity_available: 5 };

    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([threshold1, threshold2])),
      getStockSnapshot: mock(() => Promise.resolve(lowSnapshot)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
      createAlerts: mock((alerts: AlertInput[]) => Promise.resolve(alerts.length)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(2);
    expect(result.alertsCreated).toBe(2);
    expect(mocks.createAlerts).toHaveBeenCalled();
  });

  // Velocity alert tests
  test("creates low_velocity alert when days_to_stockout below threshold", async () => {
    // Stock above min threshold (50 > 10), but velocity predicts stockout soon
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 50,
    };

    // Historical: 100 units 7 days ago → 50 now = 7.14/day velocity
    // Days to stockout: 50 / 7.14 = 7 days (below days_warning of 14)
    const historicalSnapshots = [
      createHistoricalSnapshot(0, 50),
      createHistoricalSnapshot(7, 100),
    ];

    const thresholdWithDaysWarning: Threshold = {
      ...mockThreshold,
      min_quantity: 10,
      days_warning: 14,
    };

    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([thresholdWithDaysWarning])),
      getStockSnapshot: mock(() => Promise.resolve(highStockSnapshot)),
      getHistoricalSnapshots: mock(() => Promise.resolve(historicalSnapshots)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
      createAlerts: mock((alerts: AlertInput[]) => Promise.resolve(alerts.length)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(1);
    expect(mocks.getHistoricalSnapshots).toHaveBeenCalledWith(
      "tenant-123",
      100,
      1,
      7
    );

    // Verify the alert was a low_velocity type
    const createAlertsCall = mocks.createAlerts.mock.calls[0] as unknown as [AlertInput[]];
    const alerts = createAlertsCall[0];
    expect(alerts.length).toBe(1);
    const firstAlert = alerts[0];
    expect(firstAlert).toBeDefined();
    expect(firstAlert?.alert_type).toBe("low_velocity");
    expect(firstAlert?.days_to_stockout).not.toBeNull();
  });

  test("does not create velocity alert when days_warning is 0", async () => {
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 50,
    };

    const thresholdWithNoWarning: Threshold = {
      ...mockThreshold,
      min_quantity: 10,
      days_warning: 0,
    };

    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([thresholdWithNoWarning])),
      getStockSnapshot: mock(() => Promise.resolve(highStockSnapshot)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
    expect(mocks.getHistoricalSnapshots).not.toHaveBeenCalled();
  });

  test("does not create velocity alert for out of stock products", async () => {
    const outOfStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 0,
    };

    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([mockThreshold])),
      getStockSnapshot: mock(() => Promise.resolve(outOfStockSnapshot)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
      createAlerts: mock((alerts: AlertInput[]) => Promise.resolve(alerts.length)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    // Should create out_of_stock alert, not velocity alert
    expect(result.alertsCreated).toBe(1);
    expect(mocks.getHistoricalSnapshots).not.toHaveBeenCalled();

    const createAlertsCall = mocks.createAlerts.mock.calls[0] as unknown as [AlertInput[]];
    const alerts = createAlertsCall[0];
    const firstAlert = alerts[0];
    expect(firstAlert).toBeDefined();
    expect(firstAlert?.alert_type).toBe("out_of_stock");
  });

  test("does not create velocity alert when pending low_velocity alert exists", async () => {
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 50,
    };

    const historicalSnapshots = [
      createHistoricalSnapshot(0, 50),
      createHistoricalSnapshot(7, 100),
    ];

    const thresholdWithDaysWarning: Threshold = {
      ...mockThreshold,
      min_quantity: 10,
      days_warning: 14,
    };

    // Return true for low_velocity pending check
    const hasPendingAlertMock = mock((
      _userId: string,
      _variantId: number,
      _officeId: number | null,
      alertType: string
    ) => {
      if (alertType === "low_velocity") {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    });

    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([thresholdWithDaysWarning])),
      getStockSnapshot: mock(() => Promise.resolve(highStockSnapshot)),
      getHistoricalSnapshots: mock(() => Promise.resolve(historicalSnapshots)),
      hasPendingAlert: hasPendingAlertMock,
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
    expect(mocks.createAlerts).not.toHaveBeenCalled();
  });

  test("creates both low_stock and low_velocity alerts when applicable", async () => {
    // Stock below threshold AND velocity predicts quick stockout
    const lowStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 5,
    };

    const historicalSnapshots = [
      createHistoricalSnapshot(0, 5),
      createHistoricalSnapshot(7, 40),
    ];

    const thresholdWithDaysWarning: Threshold = {
      ...mockThreshold,
      min_quantity: 10,
      days_warning: 14,
    };

    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([thresholdWithDaysWarning])),
      getStockSnapshot: mock(() => Promise.resolve(lowStockSnapshot)),
      getHistoricalSnapshots: mock(() => Promise.resolve(historicalSnapshots)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
      createAlerts: mock((alerts: AlertInput[]) => Promise.resolve(alerts.length)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(2);

    const createAlertsCall = mocks.createAlerts.mock.calls[0] as unknown as [AlertInput[]];
    const alerts = createAlertsCall[0];
    expect(alerts.length).toBe(2);

    const alertTypes = alerts.map((a) => a.alert_type);
    expect(alertTypes).toContain("low_stock");
    expect(alertTypes).toContain("low_velocity");
  });

  test("does not create velocity alert when velocity is too slow", async () => {
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 100,
    };

    // Very slow velocity: only 5 units sold in 7 days = 0.71/day
    // Days to stockout: 100 / 0.71 = 140 days (above days_warning of 14)
    const historicalSnapshots = [
      createHistoricalSnapshot(0, 100),
      createHistoricalSnapshot(7, 105),
    ];

    const thresholdWithDaysWarning: Threshold = {
      ...mockThreshold,
      min_quantity: 10,
      days_warning: 14,
    };

    const { deps, mocks } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([thresholdWithDaysWarning])),
      getStockSnapshot: mock(() => Promise.resolve(highStockSnapshot)),
      getHistoricalSnapshots: mock(() => Promise.resolve(historicalSnapshots)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
    expect(mocks.createAlerts).not.toHaveBeenCalled();
  });

  test("does not create velocity alert when stock is increasing", async () => {
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 150,
    };

    // Stock increased from 100 to 150
    const historicalSnapshots = [
      createHistoricalSnapshot(0, 150),
      createHistoricalSnapshot(7, 100),
    ];

    const thresholdWithDaysWarning: Threshold = {
      ...mockThreshold,
      min_quantity: 10,
      days_warning: 14,
    };

    const { deps } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([thresholdWithDaysWarning])),
      getStockSnapshot: mock(() => Promise.resolve(highStockSnapshot)),
      getHistoricalSnapshots: mock(() => Promise.resolve(historicalSnapshots)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
  });

  test("does not create velocity alert with insufficient history", async () => {
    const highStockSnapshot: StockSnapshot = {
      ...mockSnapshot,
      quantity_available: 50,
    };

    // Only 1 snapshot - insufficient data
    const historicalSnapshots = [
      createHistoricalSnapshot(0, 50),
    ];

    const thresholdWithDaysWarning: Threshold = {
      ...mockThreshold,
      min_quantity: 10,
      days_warning: 14,
    };

    const { deps } = createMockDeps({
      getThresholdsByUser: mock(() => Promise.resolve([thresholdWithDaysWarning])),
      getStockSnapshot: mock(() => Promise.resolve(highStockSnapshot)),
      getHistoricalSnapshots: mock(() => Promise.resolve(historicalSnapshots)),
      hasPendingAlert: mock(() => Promise.resolve(false)),
    });

    const result = await generateAlertsForUser("user-456", "tenant-123", deps);

    expect(result.thresholdsChecked).toBe(1);
    expect(result.alertsCreated).toBe(0);
  });
});
