import { test, expect, describe, mock } from "bun:test";
import {
  checkThresholdBreach,
  createAlertInput,
  generateAlertsForUser,
} from "@/alerts/alert-generator";
import type { Threshold, StockSnapshot, AlertInput } from "@/db/repositories/types";
import type { AlertGeneratorDependencies } from "@/alerts/types";

const mockThreshold: Threshold = {
  id: "threshold-123",
  tenant_id: "tenant-123",
  user_id: "user-456",
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

describe("generateAlertsForUser", () => {
  interface MockOverrides {
    getThresholdsByUser?: ReturnType<typeof mock>;
    getStockSnapshot?: ReturnType<typeof mock>;
    hasPendingAlert?: ReturnType<typeof mock>;
    createAlerts?: ReturnType<typeof mock>;
  }

  interface MockDepsResult {
    deps: AlertGeneratorDependencies;
    mocks: {
      getThresholdsByUser: ReturnType<typeof mock>;
      getStockSnapshot: ReturnType<typeof mock>;
      hasPendingAlert: ReturnType<typeof mock>;
      createAlerts: ReturnType<typeof mock>;
    };
  }

  function createMockDeps(overrides: MockOverrides = {}): MockDepsResult {
    const getThresholdsByUser =
      overrides.getThresholdsByUser ?? mock(() => Promise.resolve([] as Threshold[]));
    const getStockSnapshot =
      overrides.getStockSnapshot ?? mock(() => Promise.resolve(null as StockSnapshot | null));
    const hasPendingAlert = overrides.hasPendingAlert ?? mock(() => Promise.resolve(false));
    const createAlerts = overrides.createAlerts ?? mock(() => Promise.resolve(0));

    const mocks = {
      getThresholdsByUser,
      getStockSnapshot,
      hasPendingAlert,
      createAlerts,
    };

    return {
      deps: mocks as unknown as AlertGeneratorDependencies,
      mocks,
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
});
