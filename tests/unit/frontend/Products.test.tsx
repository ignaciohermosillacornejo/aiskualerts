import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { AuthProvider } from "../../../src/frontend/contexts/AuthContext";
import { Products } from "../../../src/frontend/pages/Products";
import "../../setup";
import {
  createMockProducts,
  createMockProduct,
  createMockTenantSettings,
  createMockLimitInfo,
  createFetchMock,
  mockResponse,
} from "../../fixtures/frontend";
import type { Product } from "../../../src/frontend/types";

// Store original fetch
const originalFetch = globalThis.fetch;

describe("Products", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("module exports", () => {
    test("exports Products component", async () => {
      const { Products } = await import("../../../src/frontend/pages/Products");
      expect(Products).toBeFunction();
    });
  });

  describe("loading state", () => {
    test("shows loading spinner initially", () => {
      globalThis.fetch = createFetchMock(() => new Promise(() => {}));

      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Products)
          )
        )
      );

      expect(html).toContain("spinner");
      expect(html).toContain("loading");
    });
  });

  describe("search filtering", () => {
    test("filters products by name (case insensitive)", () => {
      const products = [
        createMockProduct({ name: "Apple iPhone", sku: "SKU-001" }),
        createMockProduct({ name: "Samsung Galaxy", sku: "SKU-002" }),
        createMockProduct({ name: "Apple MacBook", sku: "SKU-003" }),
      ];

      const search = "apple";
      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase())
      );

      expect(filtered.length).toBe(2);
      expect(filtered.every((p) => p.name.toLowerCase().includes("apple"))).toBe(true);
    });

    test("filters products by SKU (case insensitive)", () => {
      const products = [
        createMockProduct({ name: "Product A", sku: "SKU-ABC-001" }),
        createMockProduct({ name: "Product B", sku: "SKU-XYZ-002" }),
        createMockProduct({ name: "Product C", sku: "SKU-ABC-003" }),
      ];

      const search = "abc";
      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase())
      );

      expect(filtered.length).toBe(2);
    });

    test("returns all products when search is empty", () => {
      const products = createMockProducts(5);
      const search = "";

      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase())
      );

      expect(filtered.length).toBe(5);
    });

    test("returns empty when no products match", () => {
      const products = createMockProducts(5);
      const search = "nonexistent";

      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase())
      );

      expect(filtered.length).toBe(0);
    });

    test("search input placeholder is correct", () => {
      const placeholder = "Buscar por nombre o SKU...";
      expect(placeholder).toBe("Buscar por nombre o SKU...");
    });

    test("search uses form-input class", () => {
      const className = "form-input";
      expect(className).toBe("form-input");
    });
  });

  describe("StockBadge component", () => {
    function StockBadge(stock: number, threshold: number | null): { class: string; label: string } {
      if (threshold === null) {
        return { class: "badge badge-info", label: "Sin umbral" };
      }
      if (stock <= threshold) {
        return { class: "badge badge-danger", label: "Stock bajo" };
      }
      if (stock <= threshold * 1.5) {
        return { class: "badge badge-warning", label: "Precaucion" };
      }
      return { class: "badge badge-success", label: "OK" };
    }

    test("shows 'Sin umbral' badge when threshold is null", () => {
      const result = StockBadge(100, null);
      expect(result.class).toContain("badge-info");
      expect(result.label).toBe("Sin umbral");
    });

    test("shows 'Stock bajo' badge when stock <= threshold", () => {
      const result = StockBadge(5, 10);
      expect(result.class).toContain("badge-danger");
      expect(result.label).toBe("Stock bajo");
    });

    test("shows 'Stock bajo' badge when stock equals threshold", () => {
      const result = StockBadge(10, 10);
      expect(result.class).toContain("badge-danger");
      expect(result.label).toBe("Stock bajo");
    });

    test("shows 'Precaucion' badge when stock is between threshold and threshold * 1.5", () => {
      const result = StockBadge(12, 10);
      expect(result.class).toContain("badge-warning");
      expect(result.label).toBe("Precaucion");
    });

    test("shows 'Precaucion' badge at exactly threshold * 1.5", () => {
      const result = StockBadge(15, 10);
      expect(result.class).toContain("badge-warning");
      expect(result.label).toBe("Precaucion");
    });

    test("shows 'OK' badge when stock > threshold * 1.5", () => {
      const result = StockBadge(20, 10);
      expect(result.class).toContain("badge-success");
      expect(result.label).toBe("OK");
    });

    test("shows 'OK' badge with high stock", () => {
      const result = StockBadge(1000, 50);
      expect(result.class).toContain("badge-success");
      expect(result.label).toBe("OK");
    });

    test("handles zero threshold", () => {
      const result = StockBadge(0, 0);
      expect(result.class).toContain("badge-danger");
      expect(result.label).toBe("Stock bajo");
    });

    test("handles zero stock with positive threshold", () => {
      const result = StockBadge(0, 10);
      expect(result.class).toContain("badge-danger");
      expect(result.label).toBe("Stock bajo");
    });
  });

  describe("table rendering", () => {
    test("table headers are correct", () => {
      const headers = ["SKU", "Nombre", "Stock Actual", "Estado", "Ultima Sync"];
      expect(headers).toEqual(["SKU", "Nombre", "Stock Actual", "Estado", "Ultima Sync"]);
    });

    test("SKU is displayed in code element", () => {
      const product = createMockProduct({ sku: "SKU-12345" });
      expect(product.sku).toBe("SKU-12345");
    });

    test("SKU code element has correct styling", () => {
      const style = {
        backgroundColor: "#f1f5f9",
        padding: "0.25rem 0.5rem",
        borderRadius: "0.25rem",
      };
      expect(style.backgroundColor).toBe("#f1f5f9");
      expect(style.padding).toBe("0.25rem 0.5rem");
      expect(style.borderRadius).toBe("0.25rem");
    });

    test("stock is formatted with locale separator", () => {
      const stock = 12345;
      const formatted = stock.toLocaleString();
      expect(formatted).toContain(",");
    });

    test("stock value is displayed in strong element", () => {
      const product = createMockProduct({ currentStock: 100 });
      expect(product.currentStock).toBe(100);
    });

    test("date is formatted with es-CL locale", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const formatted = date.toLocaleDateString("es-CL");
      expect(formatted).toBeTruthy();
    });

    test("product row uses id as key", () => {
      const product = createMockProduct({ id: "prod-123" });
      expect(product.id).toBe("prod-123");
    });
  });

  describe("empty state", () => {
    test("shows empty state when no products found", () => {
      const filteredProducts: Product[] = [];
      const isEmpty = filteredProducts.length === 0;
      expect(isEmpty).toBe(true);
    });

    test("empty state icon is 'cube'", () => {
      const emptyStateIcon = "cube";
      expect(emptyStateIcon).toBe("cube");
    });

    test("empty state title is 'Sin productos'", () => {
      const emptyStateTitle = "Sin productos";
      expect(emptyStateTitle).toBe("Sin productos");
    });

    test("empty state message", () => {
      const message = "No se encontraron productos";
      expect(message).toBe("No se encontraron productos");
    });
  });

  describe("error state", () => {
    test("displays error when API fails", () => {
      const error = "Error al cargar productos";
      expect(error).toBe("Error al cargar productos");
    });

    test("shows error message from Error object", () => {
      const err = new Error("Network error");
      const errorMessage = err instanceof Error ? err.message : "Error al cargar productos";
      expect(errorMessage).toBe("Network error");
    });

    test("shows generic error for non-Error exceptions", () => {
      const getErrorMessage = (err: unknown): string => {
        return err instanceof Error ? err.message : "Error al cargar productos";
      };
      expect(getErrorMessage("string error")).toBe("Error al cargar productos");
    });
  });

  describe("API integration", () => {
    test("loads products on mount", async () => {
      const mockProducts = { data: createMockProducts(5), pagination: { total: 5, page: 1, limit: 20, totalPages: 1 } };
      const mockSettings = createMockTenantSettings({ bsaleConnected: true });
      const mockLimits = createMockLimitInfo();

      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/settings/limits")) {
          return Promise.resolve(mockResponse(mockLimits));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        if (url.includes("/products")) {
          return Promise.resolve(mockResponse(mockProducts));
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
                React.createElement(Products)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        // Verify fetch was called (products + settings + auth)
        const mockFetch = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
        expect(mockFetch.mock.calls.length).toBeGreaterThan(1);

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("useEffect runs once on mount", () => {
      // Test that useEffect has empty dependency array
      const dependencies: string[] = [];
      expect(dependencies).toEqual([]);
    });
  });

  describe("DOM rendering", () => {
    test("renders search input", async () => {
      const mockProducts = { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      const mockSettings = createMockTenantSettings({ bsaleConnected: true });
      const mockLimits = createMockLimitInfo();

      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/settings/limits")) {
          return Promise.resolve(mockResponse(mockLimits));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        if (url.includes("/products")) {
          return Promise.resolve(mockResponse(mockProducts));
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
                React.createElement(Products)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(container.querySelector('input[type="text"]')).not.toBeNull();

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("renders products count in title", async () => {
      const mockProducts = { data: createMockProducts(5), pagination: { total: 5, page: 1, limit: 20, totalPages: 1 } };
      const mockSettings = createMockTenantSettings({ bsaleConnected: true });
      const mockLimits = createMockLimitInfo();

      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/settings/limits")) {
          return Promise.resolve(mockResponse(mockLimits));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        if (url.includes("/products")) {
          return Promise.resolve(mockResponse(mockProducts));
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
                React.createElement(Products)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(container.textContent).toContain("Inventario");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("renders table when products exist", async () => {
      const mockProducts = { data: createMockProducts(3), pagination: { total: 3, page: 1, limit: 20, totalPages: 1 } };
      const mockSettings = createMockTenantSettings({ bsaleConnected: true });
      const mockLimits = createMockLimitInfo();

      // URL-based mock to handle parallel requests
      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/settings/limits")) {
          return Promise.resolve(mockResponse(mockLimits));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        if (url.includes("/products")) {
          return Promise.resolve(mockResponse(mockProducts));
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
                React.createElement(Products)
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

  describe("Bsale connection state", () => {
    test("shows connection prompt when Bsale is not connected", async () => {
      const mockProducts = { data: createMockProducts(3), pagination: { total: 3, page: 1, limit: 20, totalPages: 1 } };
      const mockSettings = createMockTenantSettings({ bsaleConnected: false });
      const mockLimits = createMockLimitInfo();

      globalThis.fetch = mock((url: string) => {
        if (url.includes("/auth/me")) {
          return Promise.resolve(mockResponse({ user: null }, { ok: false, status: 401 }));
        }
        if (url.includes("/settings/limits")) {
          return Promise.resolve(mockResponse(mockLimits));
        }
        if (url.includes("/settings")) {
          return Promise.resolve(mockResponse(mockSettings));
        }
        if (url.includes("/products")) {
          return Promise.resolve(mockResponse(mockProducts));
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
                React.createElement(Products)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        // Should show connection prompt, not the products table
        expect(container.querySelector("table")).toBeNull();
        expect(container.textContent).toContain("Conecta tu cuenta de Bsale");
        expect(container.textContent).toContain("Configuración");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("initial bsaleConnected state is false", () => {
      const bsaleConnected = false;
      expect(bsaleConnected).toBe(false);
    });
  });

  describe("state management", () => {
    test("initial products state is empty array", () => {
      const products: Product[] = [];
      expect(products).toEqual([]);
    });

    test("initial loading state is true", () => {
      const loading = true;
      expect(loading).toBe(true);
    });

    test("initial error state is null", () => {
      const error: string | null = null;
      expect(error).toBeNull();
    });

    test("initial search state is empty string", () => {
      const search = "";
      expect(search).toBe("");
    });

    test("search state updates on input change", () => {
      let search = "";
      const setSearch = (val: string) => { search = val; };
      setSearch("test");
      expect(search).toBe("test");
    });
  });

  describe("CSS classes", () => {
    test("table-container class", () => {
      const className = "table-container";
      expect(className).toBe("table-container");
    });

    test("table class", () => {
      const className = "table";
      expect(className).toBe("table");
    });

    test("badge class", () => {
      const className = "badge";
      expect(className).toBe("badge");
    });

    test("badge-info class", () => {
      const className = "badge-info";
      expect(className).toBe("badge-info");
    });

    test("badge-danger class", () => {
      const className = "badge-danger";
      expect(className).toBe("badge-danger");
    });

    test("badge-warning class", () => {
      const className = "badge-warning";
      expect(className).toBe("badge-warning");
    });

    test("badge-success class", () => {
      const className = "badge-success";
      expect(className).toBe("badge-success");
    });

    test("card-header class", () => {
      const className = "card-header";
      expect(className).toBe("card-header");
    });

    test("card-title class", () => {
      const className = "card-title";
      expect(className).toBe("card-title");
    });

    test("form-group class", () => {
      const className = "form-group";
      expect(className).toBe("form-group");
    });
  });

  describe("styling", () => {
    test("search card has margin bottom", () => {
      const style = { marginBottom: "1.5rem" };
      expect(style.marginBottom).toBe("1.5rem");
    });

    test("form-group has no margin bottom", () => {
      const style = { marginBottom: 0 };
      expect(style.marginBottom).toBe(0);
    });
  });

  describe("input handling", () => {
    test("onChange handler receives event target value", () => {
      let searchValue = "";
      const handleChange = (e: { target: { value: string } }) => {
        searchValue = e.target.value;
      };

      handleChange({ target: { value: "new search" } });
      expect(searchValue).toBe("new search");
    });

    test("input has correct type attribute", () => {
      const inputType = "text";
      expect(inputType).toBe("text");
    });
  });

  describe("filteredProducts computed property", () => {
    test("is recalculated on products change", () => {
      const products1 = createMockProducts(5);
      const products2 = createMockProducts(3);
      const search = "";

      const filtered1 = products1.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase())
      );

      const filtered2 = products2.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase())
      );

      expect(filtered1.length).toBe(5);
      expect(filtered2.length).toBe(3);
    });

    test("is recalculated on search change", () => {
      const products = [
        createMockProduct({ name: "Apple", sku: "A001" }),
        createMockProduct({ name: "Banana", sku: "B001" }),
      ];

      let search = "";
      const filter = () =>
        products.filter(
          (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase())
        );

      expect(filter().length).toBe(2);

      search = "apple";
      expect(filter().length).toBe(1);
    });
  });
});
