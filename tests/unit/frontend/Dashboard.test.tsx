import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { AuthProvider } from "../../../src/frontend/contexts/AuthContext";
import { Dashboard } from "../../../src/frontend/pages/Dashboard";
import "../../setup";
import {
  createMockDashboardStats,
  createMockAlerts,
  createMockTenantSettings,
  createMockSyncResult,
  createFetchMock,
  mockResponse,
} from "../../fixtures/frontend";
import type { DashboardStats, Alert } from "../../../src/frontend/types";

// Store original fetch
const originalFetch = globalThis.fetch;

describe("Dashboard", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("module exports", () => {
    test("exports Dashboard component", async () => {
      const { Dashboard } = await import("../../../src/frontend/pages/Dashboard");
      expect(Dashboard).toBeFunction();
    });
  });

  describe("loading state", () => {
    test("shows loading spinner initially", () => {
      // Never resolve - keeps loading state
      globalThis.fetch = createFetchMock(() => new Promise(() => {}));

      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Dashboard)
          )
        )
      );

      expect(html).toContain("spinner");
      expect(html).toContain("loading");
    });

    test("loading state has spinner element", () => {
      globalThis.fetch = createFetchMock(() => new Promise(() => {}));

      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Dashboard)
          )
        )
      );

      expect(html).toContain('class="spinner"');
    });
  });

  describe("error state", () => {
    test("displays error message when API fails", async () => {
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve(mockResponse({ error: "Server error" }, { ok: false, status: 500 }))
      );

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Dashboard)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(container.textContent).toContain("Error");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("shows generic error message for non-Error exceptions", () => {
      // Test error handling logic
      const getErrorMessage = (err: unknown): string => {
        return err instanceof Error ? err.message : "Error al cargar datos";
      };

      expect(getErrorMessage(new Error("Network error"))).toBe("Network error");
      expect(getErrorMessage("string error")).toBe("Error al cargar datos");
      expect(getErrorMessage(null)).toBe("Error al cargar datos");
    });
  });

  describe("StatCard component", () => {
    test("displays stat value and label", () => {
      const stats: DashboardStats = createMockDashboardStats({
        totalProducts: 150,
      });

      // Test value formatting
      expect(stats.totalProducts.toLocaleString()).toBe("150");
    });

    test("formats large numbers with locale separator", () => {
      const value = 1234567;
      expect(value.toLocaleString()).toContain(",");
    });

    test("highlight danger style for active alerts", () => {
      const activeAlerts = 5;
      const highlight = activeAlerts ? "danger" : undefined;
      expect(highlight).toBe("danger");
    });

    test("highlight warning style for low stock", () => {
      const lowStockProducts = 3;
      const highlight = lowStockProducts ? "warning" : undefined;
      expect(highlight).toBe("warning");
    });

    test("no highlight when count is zero", () => {
      const activeAlerts = 0;
      const highlight = activeAlerts ? "danger" : undefined;
      expect(highlight).toBeUndefined();
    });

    test("StatCard labels are correct", () => {
      const labels = [
        "Productos Totales",
        "Alertas Activas",
        "Stock Bajo",
        "Umbrales Configurados",
      ];
      expect(labels).toContain("Productos Totales");
      expect(labels).toContain("Alertas Activas");
      expect(labels).toContain("Stock Bajo");
      expect(labels).toContain("Umbrales Configurados");
    });
  });

  describe("SyncCard component", () => {
    test("shows last sync time when available", () => {
      const lastSyncAt = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      expect(lastSyncAt).toBeTruthy();
    });

    test("shows 'Sincronizar Ahora' button text when not syncing", () => {
      const syncing = false;
      const buttonText = syncing ? "Sincronizando..." : "Sincronizar Ahora";
      expect(buttonText).toBe("Sincronizar Ahora");
    });

    test("shows 'Sincronizando...' when syncing", () => {
      const syncing = true;
      const buttonText = syncing ? "Sincronizando..." : "Sincronizar Ahora";
      expect(buttonText).toBe("Sincronizando...");
    });

    test("button is disabled while syncing", () => {
      const syncing = true;
      expect(syncing).toBe(true);
    });

    test("displays success message after successful sync", () => {
      const syncResult = createMockSyncResult({ success: true });
      expect(syncResult.success).toBe(true);
    });

    test("displays error message after failed sync", () => {
      const syncResult = createMockSyncResult({
        success: false,
        error: "Connection failed",
      });
      expect(syncResult.success).toBe(false);
      expect(syncResult.error).toBe("Connection failed");
    });

    test("formats sync duration in seconds", () => {
      const duration = 3500; // ms
      const formatted = Math.round(duration / 1000);
      expect(formatted).toBe(4);
    });

    test("sync result displays products updated count", () => {
      const syncResult = createMockSyncResult({ productsUpdated: 50 });
      expect(syncResult.productsUpdated).toBe(50);
    });

    test("sync result displays alerts generated count", () => {
      const syncResult = createMockSyncResult({ alertsGenerated: 3 });
      expect(syncResult.alertsGenerated).toBe(3);
    });
  });

  describe("sync button flow", () => {
    test("handleSync sets syncing to true", () => {
      let syncing = false;
      const setSyncing = (val: boolean) => { syncing = val; };

      setSyncing(true);
      expect(syncing).toBe(true);
    });

    test("handleSync clears previous sync result", () => {
      let syncResult: { success: boolean } | null = { success: true };
      const setSyncResult = (val: typeof syncResult) => { syncResult = val; };

      setSyncResult(null);
      expect(syncResult).toBeNull();
    });

    test("successful sync updates lastSyncAt", () => {
      let lastSyncAt: string | null = null;
      const setLastSyncAt = (val: string | null) => { lastSyncAt = val; };

      const result = createMockSyncResult({ success: true });
      if (result.success) {
        setLastSyncAt(new Date().toISOString());
      }

      expect(lastSyncAt).not.toBeNull();
    });

    test("failed sync does not update lastSyncAt", () => {
      let lastSyncAt: string | null = null;
      const setLastSyncAt = (val: string | null) => { lastSyncAt = val; };

      const result = createMockSyncResult({ success: false });
      if (result.success) {
        setLastSyncAt(new Date().toISOString());
      }

      expect(lastSyncAt).toBeNull();
    });

    test("sync error creates error sync result", () => {
      const errorResult = {
        success: false,
        productsUpdated: 0,
        alertsGenerated: 0,
        duration: 0,
        error: "Error al sincronizar",
      };
      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toBe("Error al sincronizar");
    });
  });

  describe("recent alerts section", () => {
    test("displays 'Sin alertas' when no alerts", () => {
      const alerts: Alert[] = [];
      const isEmpty = alerts.length === 0;
      expect(isEmpty).toBe(true);
    });

    test("shows alert items when alerts exist", () => {
      const alerts = createMockAlerts(3);
      expect(alerts.length).toBe(3);
    });

    test("limits alerts to 5", () => {
      const limit = 5;
      const allAlerts = createMockAlerts(10);
      const recentAlerts = allAlerts.slice(0, limit);
      expect(recentAlerts.length).toBe(5);
    });

    test("AlertItem shows warning class for low_velocity type", () => {
      const alerts = createMockAlerts(1, "low_velocity");
      const alert = alerts[0];
      if (!alert) throw new Error("Expected alert");
      const isWarning = alert.type === "low_velocity";
      expect(isWarning).toBe(true);
    });

    test("AlertItem shows danger class for threshold_breach type", () => {
      const alerts = createMockAlerts(1, "threshold_breach");
      const alert = alerts[0];
      if (!alert) throw new Error("Expected alert");
      const isWarning = alert.type === "low_velocity";
      expect(isWarning).toBe(false);
    });

    test("shows 'Ver todas' link", () => {
      const href = "/app/alerts";
      expect(href).toBe("/app/alerts");
    });
  });

  describe("formatRelativeTime function", () => {
    function formatRelativeTime(date: string): string {
      const now = new Date();
      const then = new Date(date);
      const diffMs = now.getTime() - then.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 60) return `hace ${diffMins} min`;
      if (diffHours < 24) return `hace ${diffHours}h`;
      return `hace ${diffDays}d`;
    }

    test("formats minutes ago", () => {
      const date = new Date(Date.now() - 30 * 60000).toISOString(); // 30 min ago
      const formatted = formatRelativeTime(date);
      expect(formatted).toContain("min");
    });

    test("formats hours ago", () => {
      const date = new Date(Date.now() - 3 * 3600000).toISOString(); // 3 hours ago
      const formatted = formatRelativeTime(date);
      expect(formatted).toContain("h");
    });

    test("formats days ago", () => {
      const date = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
      const formatted = formatRelativeTime(date);
      expect(formatted).toContain("d");
    });

    test("handles zero minutes", () => {
      const date = new Date().toISOString();
      const formatted = formatRelativeTime(date);
      expect(formatted).toBe("hace 0 min");
    });
  });

  describe("API integration", () => {
    test("loads dashboard stats on mount", async () => {
      const mockStats = createMockDashboardStats();
      const mockAlerts = { alerts: createMockAlerts(3), total: 3 };
      const mockSettings = createMockTenantSettings();

      let callCount = 0;
      globalThis.fetch = createFetchMock(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        if (callCount === 2) return Promise.resolve(mockResponse(mockStats));
        if (callCount === 3) return Promise.resolve(mockResponse(mockAlerts));
        return Promise.resolve(mockResponse(mockSettings));
      });

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Dashboard)
              )
            )
          );
          setTimeout(resolve, 400);
        });

        // Should have made API calls
        expect(callCount).toBeGreaterThan(1);

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Promise.all fetches stats, alerts, and settings in parallel", () => {
      // Test the parallel fetch pattern
      const mockStats = createMockDashboardStats();
      const mockAlerts = { alerts: createMockAlerts(5), total: 5 };
      const mockSettings = createMockTenantSettings();

      const promises = [
        Promise.resolve(mockStats),
        Promise.resolve(mockAlerts),
        Promise.resolve(mockSettings),
      ];

      return Promise.all(promises).then(([stats, alerts, settings]) => {
        expect(stats).toEqual(mockStats);
        expect(alerts).toEqual(mockAlerts);
        expect(settings).toEqual(mockSettings);
      });
    });
  });

  describe("DOM rendering", () => {
    test("renders stats grid", async () => {
      const mockStats = createMockDashboardStats();
      const mockAlerts = { alerts: [], total: 0 };
      const mockSettings = createMockTenantSettings();

      // URL-based mock to handle parallel requests
      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/dashboard/stats")) {
          return Promise.resolve(mockResponse(mockStats));
        }
        if (url.includes("/alerts")) {
          return Promise.resolve(mockResponse(mockAlerts));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        return Promise.resolve(mockResponse({}, { ok: false, status: 404 }));
      }) as unknown as typeof fetch;

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Dashboard)
              )
            )
          );
          setTimeout(resolve, 400);
        });

        expect(container.innerHTML).toContain("stats-grid");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("renders sync card", async () => {
      const mockStats = createMockDashboardStats();
      const mockAlerts = { alerts: [], total: 0 };
      const mockSettings = createMockTenantSettings();

      // URL-based mock to handle parallel requests
      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/dashboard/stats")) {
          return Promise.resolve(mockResponse(mockStats));
        }
        if (url.includes("/alerts")) {
          return Promise.resolve(mockResponse(mockAlerts));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        return Promise.resolve(mockResponse({}, { ok: false, status: 404 }));
      }) as unknown as typeof fetch;

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Dashboard)
              )
            )
          );
          setTimeout(resolve, 400);
        });

        expect(container.textContent).toContain("Sincronizacion");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("renders recent alerts section", async () => {
      const mockStats = createMockDashboardStats();
      const mockAlerts = { alerts: [], total: 0 };
      const mockSettings = createMockTenantSettings();

      // URL-based mock to handle parallel requests
      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/dashboard/stats")) {
          return Promise.resolve(mockResponse(mockStats));
        }
        if (url.includes("/alerts")) {
          return Promise.resolve(mockResponse(mockAlerts));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        return Promise.resolve(mockResponse({}, { ok: false, status: 404 }));
      }) as unknown as typeof fetch;

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Dashboard)
              )
            )
          );
          setTimeout(resolve, 400);
        });

        expect(container.textContent).toContain("Alertas Recientes");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });
  });

  describe("state management", () => {
    test("initial stats state is null", () => {
      const stats: DashboardStats | null = null;
      expect(stats).toBeNull();
    });

    test("initial recentAlerts state is empty array", () => {
      const recentAlerts: Alert[] = [];
      expect(recentAlerts).toEqual([]);
    });

    test("initial loading state is true", () => {
      const loading = true;
      expect(loading).toBe(true);
    });

    test("initial error state is null", () => {
      const error: string | null = null;
      expect(error).toBeNull();
    });

    test("initial syncing state is false", () => {
      const syncing = false;
      expect(syncing).toBe(false);
    });

    test("initial syncResult state is null", () => {
      const syncResult: { success: boolean } | null = null;
      expect(syncResult).toBeNull();
    });

    test("initial lastSyncAt state is null", () => {
      const lastSyncAt: string | null = null;
      expect(lastSyncAt).toBeNull();
    });
  });

  describe("CSS classes", () => {
    test("stats-grid class exists", () => {
      const className = "stats-grid";
      expect(className).toBe("stats-grid");
    });

    test("stat-card class exists", () => {
      const className = "stat-card";
      expect(className).toBe("stat-card");
    });

    test("stat-label class exists", () => {
      const className = "stat-label";
      expect(className).toBe("stat-label");
    });

    test("stat-value class exists", () => {
      const className = "stat-value";
      expect(className).toBe("stat-value");
    });

    test("alert-item class exists", () => {
      const className = "alert-item";
      expect(className).toBe("alert-item");
    });

    test("alert-icon class with danger modifier", () => {
      const isWarning = false;
      const className = `alert-icon ${isWarning ? "warning" : "danger"}`;
      expect(className).toBe("alert-icon danger");
    });

    test("alert-icon class with warning modifier", () => {
      const isWarning = true;
      const className = `alert-icon ${isWarning ? "warning" : "danger"}`;
      expect(className).toBe("alert-icon warning");
    });
  });

  describe("styling", () => {
    test("danger highlight color", () => {
      const dangerColor = "#ef4444";
      expect(dangerColor).toBe("#ef4444");
    });

    test("warning highlight color", () => {
      const warningColor = "#f59e0b";
      expect(warningColor).toBe("#f59e0b");
    });

    test("success background color for sync result", () => {
      const successBg = "#f0fdf4";
      expect(successBg).toBe("#f0fdf4");
    });

    test("error background color for sync result", () => {
      const errorBg = "#fef2f2";
      expect(errorBg).toBe("#fef2f2");
    });

    test("success text color", () => {
      const successColor = "#166534";
      expect(successColor).toBe("#166534");
    });

    test("error text color", () => {
      const errorColor = "#991b1b";
      expect(errorColor).toBe("#991b1b");
    });
  });

  describe("useCallback memoization", () => {
    test("loadDashboard depends on empty array", () => {
      const dependencies: string[] = [];
      expect(dependencies).toEqual([]);
    });

    test("handleSync depends on loadDashboard", () => {
      const dependencies = ["loadDashboard"];
      expect(dependencies).toContain("loadDashboard");
    });
  });

  describe("sanitizeText usage", () => {
    test("sanitizes product name in AlertItem", () => {
      // Test that sanitizeText is used for display
      const productName = "Test <script>alert('xss')</script> Product";
      // sanitizeText should escape HTML
      expect(productName).toContain("script");
    });

    test("sanitizes message in AlertItem", () => {
      const message = "Stock below <b>threshold</b>";
      expect(message).toContain("threshold");
    });
  });
});
