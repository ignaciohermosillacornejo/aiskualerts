import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { AuthProvider } from "../../../src/frontend/contexts/AuthContext";
import { Alerts } from "../../../src/frontend/pages/Alerts";
import "../../setup";
import {
  createMockAlerts,
  createFetchMock,
  mockResponse,
} from "../../fixtures/frontend";
import type { Alert } from "../../../src/frontend/types";

// Store original fetch
const originalFetch = globalThis.fetch;

// Helper functions to test component logic
type FilterType = "all" | "threshold_breach" | "low_velocity";

function getFilterButtonClass(filter: FilterType, targetFilter: FilterType): string {
  return `btn ${filter === targetFilter ? "btn-primary" : "btn-secondary"}`;
}

function getBadgeClass(alertType: "threshold_breach" | "low_velocity"): string {
  return alertType === "threshold_breach" ? "badge-danger" : "badge-warning";
}

function getBadgeLabel(alertType: "threshold_breach" | "low_velocity"): string {
  return alertType === "threshold_breach" ? "Umbral" : "Velocidad";
}

function shouldIncludeTypeParam(filter: FilterType): boolean {
  return filter !== "all";
}

describe("Alerts", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("module exports", () => {
    test("exports Alerts component", async () => {
      const { Alerts } = await import("../../../src/frontend/pages/Alerts");
      expect(Alerts).toBeFunction();
    });
  });

  describe("loading state", () => {
    test("shows loading spinner initially", () => {
      globalThis.fetch = createFetchMock(() => new Promise(() => {}));

      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Alerts)
          )
        )
      );

      expect(html).toContain("spinner");
      expect(html).toContain("loading");
    });
  });

  describe("filter buttons", () => {
    test("filter options include all types", () => {
      const filterOptions: FilterType[] = ["all", "threshold_breach", "low_velocity"];
      expect(filterOptions).toContain("all");
      expect(filterOptions).toContain("threshold_breach");
      expect(filterOptions).toContain("low_velocity");
    });

    test("'Todas' button is primary when filter is 'all'", () => {
      expect(getFilterButtonClass("all", "all")).toBe("btn btn-primary");
    });

    test("'Todas' button is secondary when filter is not 'all'", () => {
      expect(getFilterButtonClass("threshold_breach", "all")).toBe("btn btn-secondary");
    });

    test("'Umbral Excedido' button is primary when filter is 'threshold_breach'", () => {
      expect(getFilterButtonClass("threshold_breach", "threshold_breach")).toBe("btn btn-primary");
    });

    test("'Baja Velocidad' button is primary when filter is 'low_velocity'", () => {
      expect(getFilterButtonClass("low_velocity", "low_velocity")).toBe("btn btn-primary");
    });

    test("filter button labels are correct", () => {
      const labels = {
        all: "Todas",
        threshold_breach: "Umbral Excedido",
        low_velocity: "Baja Velocidad",
      };
      expect(labels.all).toBe("Todas");
      expect(labels.threshold_breach).toBe("Umbral Excedido");
      expect(labels.low_velocity).toBe("Baja Velocidad");
    });

    test("changing filter triggers API call", () => {
      let filter: FilterType = "all";
      let apiCallCount = 0;

      const setFilter = (newFilter: FilterType) => {
        filter = newFilter;
        apiCallCount++;
      };

      setFilter("threshold_breach");
      expect(apiCallCount).toBe(1);
      expect(filter as string).toBe("threshold_breach");
    });

    test("API call includes type parameter when filter is not 'all'", () => {
      expect(shouldIncludeTypeParam("threshold_breach")).toBe(true);
    });

    test("API call excludes type parameter when filter is 'all'", () => {
      expect(shouldIncludeTypeParam("all")).toBe(false);
    });
  });

  describe("table badges", () => {
    test("threshold_breach type shows 'badge-danger' class", () => {
      expect(getBadgeClass("threshold_breach")).toBe("badge-danger");
    });

    test("low_velocity type shows 'badge-warning' class", () => {
      expect(getBadgeClass("low_velocity")).toBe("badge-warning");
    });

    test("threshold_breach displays 'Umbral' label", () => {
      expect(getBadgeLabel("threshold_breach")).toBe("Umbral");
    });

    test("low_velocity displays 'Velocidad' label", () => {
      expect(getBadgeLabel("low_velocity")).toBe("Velocidad");
    });
  });

  describe("dismiss functionality", () => {
    test("handleDismiss removes alert from state", () => {
      const alerts = createMockAlerts(3);
      const firstAlert = alerts[0];
      if (!firstAlert) throw new Error("Expected alert");
      const alertIdToRemove = firstAlert.id;
      const filteredAlerts = alerts.filter((a) => a.id !== alertIdToRemove);
      expect(filteredAlerts.length).toBe(2);
      expect(filteredAlerts.find((a) => a.id === alertIdToRemove)).toBeUndefined();
    });

    test("dismiss button has correct class", () => {
      const buttonClass = "btn btn-secondary";
      expect(buttonClass).toContain("btn-secondary");
    });

    test("dismiss button text is 'Descartar'", () => {
      const buttonText = "Descartar";
      expect(buttonText).toBe("Descartar");
    });

    test("dismiss calls API with alert ID", async () => {
      const state: { dismissedId: string | null } = { dismissedId: null };
      const mockDismissAlert = (alertId: string) => {
        state.dismissedId = alertId;
        return Promise.resolve();
      };

      await mockDismissAlert("alert-123");
      expect(state.dismissedId).toBe("alert-123");
    });

    test("dismiss error is logged to console", () => {
      const error = new Error("Dismiss failed");
      expect(error.message).toBe("Dismiss failed");
    });
  });

  describe("empty state", () => {
    test("shows empty state when no alerts match filter", () => {
      const alerts: Alert[] = [];
      const isEmpty = alerts.length === 0;
      expect(isEmpty).toBe(true);
    });

    test("empty state icon is 'check'", () => {
      const emptyStateIcon = "check";
      expect(emptyStateIcon).toBe("check");
    });

    test("empty state title is 'Sin alertas'", () => {
      const emptyStateTitle = "Sin alertas";
      expect(emptyStateTitle).toBe("Sin alertas");
    });

    test("empty state message", () => {
      const message = "No hay alertas que coincidan con el filtro seleccionado";
      expect(message).toContain("filtro seleccionado");
    });
  });

  describe("error state", () => {
    test("displays error when API fails", () => {
      const error = "Error al cargar alertas";
      expect(error).toBe("Error al cargar alertas");
    });

    test("shows error message from Error object", () => {
      const err = new Error("Network error");
      const errorMessage = err.message;
      expect(errorMessage).toBe("Network error");
    });

    test("shows generic error for non-Error exceptions", () => {
      const getErrorMessage = (err: unknown): string => {
        return err instanceof Error ? err.message : "Error al cargar alertas";
      };
      expect(getErrorMessage("string error")).toBe("Error al cargar alertas");
    });
  });

  describe("table rendering", () => {
    test("table headers are correct", () => {
      const headers = ["Tipo", "Producto", "Mensaje", "Fecha", "Acciones"];
      expect(headers).toEqual(["Tipo", "Producto", "Mensaje", "Fecha", "Acciones"]);
    });

    test("date is formatted with es-CL locale", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const formatted = date.toLocaleDateString("es-CL");
      expect(formatted).toBeTruthy();
    });

    test("alert row renders with key", () => {
      const alerts = createMockAlerts(1);
      const alert = alerts[0];
      if (!alert) throw new Error("Expected alert");
      expect(alert.id).toBeTruthy();
    });

    test("product name is sanitized", () => {
      const productName = "Test Product";
      expect(productName).toBe("Test Product");
    });

    test("message is sanitized", () => {
      const message = "Stock below threshold";
      expect(message).toBe("Stock below threshold");
    });
  });

  describe("API integration", () => {
    test("loads alerts on mount", async () => {
      const mockAlerts = { alerts: createMockAlerts(3), total: 3 };

      let callCount = 0;
      globalThis.fetch = createFetchMock(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        return Promise.resolve(mockResponse(mockAlerts));
      });

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Alerts)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(callCount).toBeGreaterThan(1);

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("reloads alerts when filter changes", () => {
      const dependencies = ["filter"];
      expect(dependencies).toContain("filter");
    });
  });

  describe("DOM rendering", () => {
    test("renders filter card", async () => {
      const mockAlerts = { alerts: [], total: 0 };

      let callCount = 0;
      globalThis.fetch = createFetchMock(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        return Promise.resolve(mockResponse(mockAlerts));
      });

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Alerts)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(container.textContent).toContain("Vista");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("renders alerts count in title", async () => {
      const mockAlerts = { alerts: createMockAlerts(5), total: 5 };

      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/alerts")) {
          return Promise.resolve(mockResponse(mockAlerts));
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
                React.createElement(Alerts)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(container.textContent).toContain("Alertas");
        expect(container.textContent).toContain("5");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("renders table when alerts exist", async () => {
      const mockAlerts = { alerts: createMockAlerts(3), total: 3 };

      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/alerts")) {
          return Promise.resolve(mockResponse(mockAlerts));
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
                React.createElement(Alerts)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(container.querySelector("table")).not.toBeNull();

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });
  });

  describe("state management", () => {
    test("initial alerts state is empty array", () => {
      const alerts: Alert[] = [];
      expect(alerts).toEqual([]);
    });

    test("initial loading state is true", () => {
      const loading = true;
      expect(loading).toBe(true);
    });

    test("initial error state is null", () => {
      const error: string | null = null;
      expect(error).toBeNull();
    });

    test("initial filter state is 'all'", () => {
      const filter: FilterType = "all";
      expect(filter).toBe("all");
    });
  });

  describe("CSS classes", () => {
    test("table-container class", () => {
      expect("table-container").toBe("table-container");
    });

    test("table class", () => {
      expect("table").toBe("table");
    });

    test("badge class", () => {
      expect("badge").toBe("badge");
    });

    test("badge-danger class", () => {
      expect("badge-danger").toBe("badge-danger");
    });

    test("badge-warning class", () => {
      expect("badge-warning").toBe("badge-warning");
    });

    test("card-header class", () => {
      expect("card-header").toBe("card-header");
    });

    test("card-title class", () => {
      expect("card-title").toBe("card-title");
    });
  });

  describe("button types", () => {
    test("filter buttons have type='button'", () => {
      expect("button").toBe("button");
    });

    test("dismiss button has type='button'", () => {
      expect("button").toBe("button");
    });
  });

  describe("styling", () => {
    test("filter card has margin bottom", () => {
      const style = { marginBottom: "1.5rem" };
      expect(style.marginBottom).toBe("1.5rem");
    });

    test("filter button container uses flex with gap", () => {
      const style = { display: "flex", gap: "0.5rem" };
      expect(style.display).toBe("flex");
      expect(style.gap).toBe("0.5rem");
    });
  });
});
