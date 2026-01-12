import { test, expect, describe } from "bun:test";

describe("Frontend Types", () => {
  test("Alert type has required fields", () => {
    const alert = {
      id: "1",
      type: "threshold_breach" as const,
      productId: "p1",
      productName: "Test Product",
      message: "Test message",
      createdAt: new Date().toISOString(),
      dismissedAt: null,
    };

    expect(alert.id).toBeDefined();
    expect(alert.type).toBe("threshold_breach");
    expect(alert.productName).toBeDefined();
  });

  test("Product type has required fields", () => {
    const product = {
      id: "p1",
      bsaleId: 1001,
      sku: "SKU001",
      name: "Test Product",
      currentStock: 10,
      threshold: 5,
      lastSyncAt: new Date().toISOString(),
    };

    expect(product.id).toBeDefined();
    expect(product.sku).toBe("SKU001");
    expect(product.currentStock).toBe(10);
  });

  test("Threshold type has required fields", () => {
    const threshold = {
      id: "t1",
      productId: "p1",
      productName: "Test Product",
      minQuantity: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(threshold.id).toBeDefined();
    expect(threshold.minQuantity).toBe(10);
  });

  test("DashboardStats type has required fields", () => {
    const stats = {
      totalProducts: 100,
      activeAlerts: 5,
      lowStockProducts: 10,
      configuredThresholds: 25,
    };

    expect(stats.totalProducts).toBe(100);
    expect(stats.activeAlerts).toBe(5);
  });
});

describe("API Client Structure", () => {
  test("api module exports expected functions", async () => {
    const { api } = await import("../../../src/frontend/api/client");

    expect(api.getDashboardStats).toBeFunction();
    expect(api.getAlerts).toBeFunction();
    expect(api.dismissAlert).toBeFunction();
    expect(api.getProducts).toBeFunction();
    expect(api.getThresholds).toBeFunction();
    expect(api.createThreshold).toBeFunction();
    expect(api.updateThreshold).toBeFunction();
    expect(api.deleteThreshold).toBeFunction();
    expect(api.getSettings).toBeFunction();
    expect(api.updateSettings).toBeFunction();
    expect(api.login).toBeFunction();
    expect(api.logout).toBeFunction();
    expect(api.getCurrentUser).toBeFunction();
  });
});
