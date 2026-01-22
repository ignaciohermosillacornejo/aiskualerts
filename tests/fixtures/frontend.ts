/**
 * Shared mock data factories for frontend tests
 */
import type { Alert, Product, Threshold, DashboardStats, TenantSettings, User, LimitInfo } from "../../src/frontend/types";

// Factory functions for creating mock data

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    subscriptionStatus: "none",
    ...overrides,
  } satisfies User;
}

export function createMockAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: `alert-${String(Date.now())}-${Math.random().toString(36).substring(7)}`,
    type: "threshold_breach",
    productId: "prod-1",
    productName: "Test Product",
    message: "Stock below threshold",
    createdAt: new Date().toISOString(),
    dismissedAt: null,
    ...overrides,
  };
}

export function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: `prod-${String(Date.now())}-${Math.random().toString(36).substring(7)}`,
    bsaleId: Math.floor(Math.random() * 10000),
    sku: `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    name: "Test Product",
    currentStock: 100,
    threshold: 10,
    thresholdType: "quantity",
    minDays: null,
    velocityInfo: null,
    alertState: "ok",
    unitPrice: 1000,
    lastSyncAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockThreshold(overrides: Partial<Threshold> = {}): Threshold {
  return {
    id: `threshold-${String(Date.now())}-${Math.random().toString(36).substring(7)}`,
    productId: "prod-1",
    productName: "Test Product",
    thresholdType: "quantity",
    minQuantity: 10,
    minDays: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
    ...overrides,
  };
}

export function createMockDashboardStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    totalProducts: 150,
    activeAlerts: 3,
    lowStockProducts: 5,
    configuredThresholds: 25,
    ...overrides,
  };
}

export function createMockTenantSettings(overrides: Partial<TenantSettings> = {}): TenantSettings {
  return {
    companyName: "Test Company",
    email: "company@example.com",
    bsaleConnected: true,
    syncStatus: "success",
    lastSyncAt: new Date().toISOString(),
    emailNotifications: true,
    notificationEmail: "alerts@example.com",
    syncFrequency: "hourly",
    digestFrequency: "daily",
    subscriptionStatus: "none",
    subscriptionEndsAt: null,
    ...overrides,
  };
}

export function createMockLimitInfo(overrides: Partial<LimitInfo> = {}): LimitInfo {
  return {
    plan: "FREE",
    thresholds: {
      current: 5,
      max: 10,
      remaining: 5,
      isOverLimit: false,
    },
    ...overrides,
  };
}

export interface SyncResult {
  success: boolean;
  productsUpdated: number;
  alertsGenerated: number;
  duration: number;
  error?: string;
}

export function createMockSyncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    success: true,
    productsUpdated: 50,
    alertsGenerated: 2,
    duration: 3500,
    ...overrides,
  };
}

// Batch factory functions for creating multiple items

export function createMockAlerts(count: number, type?: "threshold_breach" | "low_velocity"): Alert[] {
  return Array.from({ length: count }, (_, i) =>
    createMockAlert({
      id: `alert-${String(i + 1)}`,
      type: type ?? (i % 2 === 0 ? "threshold_breach" : "low_velocity"),
      productName: `Product ${String(i + 1)}`,
      message: type === "low_velocity" || i % 2 === 1
        ? `Low sales velocity detected for Product ${String(i + 1)}`
        : `Stock below threshold for Product ${String(i + 1)}`,
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    })
  );
}

export function createMockProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, i) =>
    createMockProduct({
      id: `prod-${String(i + 1)}`,
      sku: `SKU-${String(i + 1).padStart(4, "0")}`,
      name: `Product ${String(i + 1)}`,
      currentStock: Math.floor(Math.random() * 200),
      threshold: i % 3 === 0 ? null : Math.floor(Math.random() * 50),
      lastSyncAt: new Date(Date.now() - i * 86400000).toISOString(),
    })
  );
}

export function createMockThresholds(count: number, products?: Product[]): Threshold[] {
  return Array.from({ length: count }, (_, i) => {
    // eslint-disable-next-line security/detect-object-injection -- Safe array access in test factory
    const product = products?.[i];
    return createMockThreshold({
      id: `threshold-${String(i + 1)}`,
      productId: product?.id ?? `prod-${String(i + 1)}`,
      productName: product?.name ?? `Product ${String(i + 1)}`,
      minQuantity: Math.floor(Math.random() * 50) + 5,
    });
  });
}

// Helper function to create fetch mock
import { mock } from "bun:test";

export function createFetchMock(handler: () => Promise<Response>) {
  const mockFn = mock(handler) as unknown as typeof fetch;
  return mockFn;
}

// Create a mock response helper
export function mockResponse(data: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  const { ok = true, status = 200 } = options;
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? "OK" : "Error",
    type: "basic",
    url: "",
    clone: () => mockResponse(data, options),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

// Sequential mock handler for multiple API calls
export function createSequentialMock(...responses: Response[]): () => Promise<Response> {
  if (responses.length === 0) {
    throw new Error("createSequentialMock requires at least one response");
  }
  let callIndex = 0;
  return () => {
    // eslint-disable-next-line security/detect-object-injection -- Safe array access in test helper
    const response = responses[callIndex] ?? responses[responses.length - 1];
    if (!response) {
      throw new Error("No response available");
    }
    callIndex++;
    return Promise.resolve(response);
  };
}
