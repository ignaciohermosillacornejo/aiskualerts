import { test, expect, describe, mock } from "bun:test";
import { createAlertResetService } from "@/alerts/alert-reset";
import type { Alert, StockSnapshot, Threshold } from "@/db/repositories/types";
import type { AlertResetDeps } from "@/alerts/alert-reset";

const mockDismissedAlert: Alert = {
  id: "alert-123",
  tenant_id: "tenant-123",
  user_id: "user-456",
  dismissed_by: "user-456",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  sku: "SKU-001",
  product_name: "Test Product",
  alert_type: "low_stock",
  current_quantity: 5,
  threshold_quantity: 10,
  days_to_stockout: null,
  status: "dismissed",
  sent_at: new Date(),
  dismissed_at: new Date(),
  last_notified_at: null,
  created_at: new Date(),
};

const mockQuantityThreshold: Threshold = {
  id: "threshold-123",
  tenant_id: "tenant-123",
  user_id: "user-456",
  created_by: "user-456",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  threshold_type: "quantity",
  min_quantity: 10,
  min_days: null,
  days_warning: 7,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockDaysThreshold: Threshold = {
  id: "threshold-days-123",
  tenant_id: "tenant-123",
  user_id: "user-456",
  created_by: "user-456",
  bsale_variant_id: 100,
  bsale_office_id: 1,
  threshold_type: "days",
  min_quantity: null,
  min_days: 7,
  days_warning: 14,
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
  quantity: 15,
  quantity_reserved: 0,
  quantity_available: 15,
  unit_price: null,
  snapshot_date: new Date(),
  created_at: new Date(),
};

describe("createAlertResetService", () => {
  describe("resetRecoveredAlerts", () => {
    test("resets dismissed alerts when stock recovers above threshold (quantity-based)", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        getStockSnapshot: mock(() =>
          Promise.resolve({
            ...mockSnapshot,
            quantity_available: 15, // Above threshold of 10
          })
        ),
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).toHaveBeenCalledWith("alert-123");
    });

    test("does not reset alerts when stock still below threshold", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        getStockSnapshot: mock(() =>
          Promise.resolve({
            ...mockSnapshot,
            quantity_available: 5, // Still below threshold of 10
          })
        ),
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).not.toHaveBeenCalled();
    });

    test("resets days-based alerts when days left recovers", async () => {
      const resetAlertMock = mock(() => Promise.resolve());
      const mockVelocityCalculator = {
        calculateDaysLeft: mock(() =>
          Promise.resolve({
            daysLeft: 14, // Above threshold of 7 days
            avgDailyConsumption: 2,
            currentStock: 28,
          })
        ),
        isBelowDaysThreshold: mock(() => Promise.resolve(false)),
        getVelocityInfo: mock(() =>
          Promise.resolve({
            daysLeft: 14,
            avgDailyConsumption: 2,
            weeklyConsumption: 14,
            velocityTrend: "stable" as const,
          })
        ),
      };

      const daysAlert: Alert = {
        ...mockDismissedAlert,
        id: "alert-days-123",
        alert_type: "low_velocity",
        days_to_stockout: 3,
      };

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([daysAlert])),
        getStockSnapshot: mock(() =>
          Promise.resolve({
            ...mockSnapshot,
            quantity_available: 28,
          })
        ),
        getThreshold: mock(() => Promise.resolve(mockDaysThreshold)),
        velocityCalculator: mockVelocityCalculator,
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).toHaveBeenCalledWith("alert-days-123");
      expect(mockVelocityCalculator.calculateDaysLeft).toHaveBeenCalledWith({
        tenantId: "tenant-123",
        variantId: 100,
        officeId: 1,
        currentStock: 28,
      });
    });

    test("does not reset days-based alerts when days left still below threshold", async () => {
      const resetAlertMock = mock(() => Promise.resolve());
      const mockVelocityCalculator = {
        calculateDaysLeft: mock(() =>
          Promise.resolve({
            daysLeft: 3, // Still below threshold of 7 days
            avgDailyConsumption: 5,
            currentStock: 15,
          })
        ),
        isBelowDaysThreshold: mock(() => Promise.resolve(true)),
        getVelocityInfo: mock(() =>
          Promise.resolve({
            daysLeft: 3,
            avgDailyConsumption: 5,
            weeklyConsumption: 35,
            velocityTrend: "stable" as const,
          })
        ),
      };

      const daysAlert: Alert = {
        ...mockDismissedAlert,
        id: "alert-days-123",
        alert_type: "low_velocity",
        days_to_stockout: 3,
      };

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([daysAlert])),
        getStockSnapshot: mock(() =>
          Promise.resolve({
            ...mockSnapshot,
            quantity_available: 15,
          })
        ),
        getThreshold: mock(() => Promise.resolve(mockDaysThreshold)),
        velocityCalculator: mockVelocityCalculator,
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).not.toHaveBeenCalled();
    });

    test("handles missing snapshot gracefully", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        getStockSnapshot: mock(() => Promise.resolve(null)), // No snapshot found
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).not.toHaveBeenCalled();
    });

    test("handles missing threshold gracefully", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        getStockSnapshot: mock(() => Promise.resolve(mockSnapshot)),
        getThreshold: mock(() => Promise.resolve(null)), // No threshold found
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).not.toHaveBeenCalled();
    });

    test("handles errors gracefully and adds to errors array", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        getStockSnapshot: mock(() => Promise.reject(new Error("Database connection failed"))),
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe("Failed to check alert alert-123: Database connection failed");
      expect(resetAlertMock).not.toHaveBeenCalled();
    });

    test("handles non-Error exceptions gracefully", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        getStockSnapshot: mock(() => Promise.reject("string error")),
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe("Failed to check alert alert-123: Unknown error");
    });

    test("returns correct counts for multiple alerts", async () => {
      const alert1: Alert = { ...mockDismissedAlert, id: "alert-1" };
      const alert2: Alert = { ...mockDismissedAlert, id: "alert-2", bsale_variant_id: 200 };
      const alert3: Alert = { ...mockDismissedAlert, id: "alert-3", bsale_variant_id: 300 };

      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([alert1, alert2, alert3])),
        getStockSnapshot: mock((_tenantId: string, variantId: number) => {
          // Alert 1: recovered (15 >= 10)
          if (variantId === 100) {
            return Promise.resolve({ ...mockSnapshot, quantity_available: 15 });
          }
          // Alert 2: not recovered (5 < 10)
          if (variantId === 200) {
            return Promise.resolve({ ...mockSnapshot, bsale_variant_id: 200, quantity_available: 5 });
          }
          // Alert 3: recovered (20 >= 10)
          if (variantId === 300) {
            return Promise.resolve({ ...mockSnapshot, bsale_variant_id: 300, quantity_available: 20 });
          }
          return Promise.resolve(null);
        }),
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(3);
      expect(result.alertsReset).toBe(2); // Only alert1 and alert3 recovered
      expect(result.errors).toHaveLength(0);
    });

    test("returns empty result when no dismissed alerts", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([])),
        getStockSnapshot: mock(() => Promise.resolve(mockSnapshot)),
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(0);
      expect(result.alertsReset).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).not.toHaveBeenCalled();
    });

    test("skips days-based check when velocityCalculator not provided", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const daysAlert: Alert = {
        ...mockDismissedAlert,
        id: "alert-days-123",
        alert_type: "low_velocity",
      };

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([daysAlert])),
        getStockSnapshot: mock(() => Promise.resolve(mockSnapshot)),
        getThreshold: mock(() => Promise.resolve(mockDaysThreshold)),
        // No velocityCalculator provided
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(0); // Cannot evaluate days threshold without velocityCalculator
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).not.toHaveBeenCalled();
    });

    test("resets alert when stock equals threshold exactly", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        getStockSnapshot: mock(() =>
          Promise.resolve({
            ...mockSnapshot,
            quantity_available: 10, // Exactly at threshold of 10
          })
        ),
        getThreshold: mock(() => Promise.resolve(mockQuantityThreshold)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(1); // Stock equals threshold, considered recovered
      expect(result.errors).toHaveLength(0);
      expect(resetAlertMock).toHaveBeenCalledWith("alert-123");
    });

    test("handles null min_quantity by using 0 as default", async () => {
      const resetAlertMock = mock(() => Promise.resolve());

      const thresholdWithNullMinQuantity: Threshold = {
        ...mockQuantityThreshold,
        min_quantity: null,
      };

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([mockDismissedAlert])),
        getStockSnapshot: mock(() =>
          Promise.resolve({
            ...mockSnapshot,
            quantity_available: 0, // Zero stock equals null/0 threshold
          })
        ),
        getThreshold: mock(() => Promise.resolve(thresholdWithNullMinQuantity)),
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(1); // 0 >= 0 is true
      expect(resetAlertMock).toHaveBeenCalledWith("alert-123");
    });

    test("handles null min_days by using 0 as default", async () => {
      const resetAlertMock = mock(() => Promise.resolve());
      const mockVelocityCalculator = {
        calculateDaysLeft: mock(() =>
          Promise.resolve({
            daysLeft: 0, // Zero days left
            avgDailyConsumption: 10,
            currentStock: 0,
          })
        ),
        isBelowDaysThreshold: mock(() => Promise.resolve(false)),
        getVelocityInfo: mock(() =>
          Promise.resolve({
            daysLeft: 0,
            avgDailyConsumption: 10,
            weeklyConsumption: 70,
            velocityTrend: "stable" as const,
          })
        ),
      };

      const thresholdWithNullMinDays: Threshold = {
        ...mockDaysThreshold,
        min_days: null,
      };

      const daysAlert: Alert = {
        ...mockDismissedAlert,
        id: "alert-days-123",
        alert_type: "low_velocity",
      };

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([daysAlert])),
        getStockSnapshot: mock(() => Promise.resolve({ ...mockSnapshot, quantity_available: 0 })),
        getThreshold: mock(() => Promise.resolve(thresholdWithNullMinDays)),
        velocityCalculator: mockVelocityCalculator,
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(1); // 0 >= 0 is true
      expect(resetAlertMock).toHaveBeenCalledWith("alert-days-123");
    });

    test("handles null bsale_office_id in alert", async () => {
      const resetAlertMock = mock(() => Promise.resolve());
      const getStockSnapshotMock = mock(() =>
        Promise.resolve({
          ...mockSnapshot,
          bsale_office_id: null,
          quantity_available: 15,
        })
      );
      const getThresholdMock = mock(() =>
        Promise.resolve({
          ...mockQuantityThreshold,
          bsale_office_id: null,
        })
      );

      const alertWithNullOffice: Alert = {
        ...mockDismissedAlert,
        bsale_office_id: null,
      };

      const deps: AlertResetDeps = {
        getDismissedAlerts: mock(() => Promise.resolve([alertWithNullOffice])),
        getStockSnapshot: getStockSnapshotMock,
        getThreshold: getThresholdMock,
        resetAlert: resetAlertMock,
      };

      const service = createAlertResetService(deps);
      const result = await service.resetRecoveredAlerts("tenant-123");

      expect(result.alertsChecked).toBe(1);
      expect(result.alertsReset).toBe(1);
      expect(getStockSnapshotMock).toHaveBeenCalledWith("tenant-123", 100, null);
      expect(getThresholdMock).toHaveBeenCalledWith("tenant-123", 100, null);
    });
  });
});
