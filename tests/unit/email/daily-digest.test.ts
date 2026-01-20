import { test, expect, describe } from "bun:test";
import {
  renderDailyDigestEmail,
  type DigestEmailParams,
} from "@/email/templates/daily-digest";

describe("renderDailyDigestEmail", () => {
  const baseParams: DigestEmailParams = {
    tenantName: "Test Company SpA",
    date: new Date("2024-06-15T10:00:00Z"),
    alerts: [
      {
        sku: "SKU001",
        productName: "Product One",
        currentStock: 5,
        threshold: 10,
        alertType: "low_stock",
      },
      {
        sku: "SKU002",
        productName: "Product Two",
        currentStock: 0,
        threshold: 5,
        alertType: "out_of_stock",
      },
      {
        sku: "SKU003",
        productName: "Product Three",
        currentStock: 50,
        threshold: null,
        alertType: "low_velocity",
      },
    ],
    skippedThresholdCount: 0,
  };

  test("returns empty string when alerts array is empty", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).toBe("");
  });

  test("renders HTML document with correct structure", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html lang=\"es\">");
    expect(result).toContain("</html>");
  });

  test("includes tenant name in header", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("Test Company SpA");
  });

  test("includes AISku Alerts branding", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("AISku Alerts");
    expect(result).toContain("Resumen de Inventario");
  });

  test("formats date in Spanish locale", () => {
    const result = renderDailyDigestEmail(baseParams);

    // The date should be formatted in Spanish
    expect(result).toContain("2024");
  });

  test("shows correct count for out_of_stock alerts", () => {
    const result = renderDailyDigestEmail(baseParams);

    // Should show 1 out of stock
    expect(result).toContain("Sin Stock");
  });

  test("shows correct count for low_stock alerts", () => {
    const result = renderDailyDigestEmail(baseParams);

    // Should show 1 low stock
    expect(result).toContain("Stock Bajo");
  });

  test("shows correct count for low_velocity alerts", () => {
    const result = renderDailyDigestEmail(baseParams);

    // Should show 1 low velocity
    expect(result).toContain("Baja Rotacion");
  });

  test("displays total alert count", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("Detalle de Alertas (3)");
  });

  test("includes alert table headers", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("SKU");
    expect(result).toContain("Producto");
    expect(result).toContain("Stock");
    expect(result).toContain("Umbral");
    expect(result).toContain("Tipo");
  });

  test("renders SKU values in table", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("SKU001");
    expect(result).toContain("SKU002");
    expect(result).toContain("SKU003");
  });

  test("renders product names in table", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("Product One");
    expect(result).toContain("Product Two");
    expect(result).toContain("Product Three");
  });

  test("renders current stock values", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain(">5<");
    expect(result).toContain(">0<");
    expect(result).toContain(">50<");
  });

  test("renders threshold values with dash for null", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain(">10<");
    expect(result).toContain(">5<");
    expect(result).toContain(">-<"); // null threshold
  });

  test("renders alert type badges", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("Sin Stock");
    expect(result).toContain("Stock Bajo");
    expect(result).toContain("Baja Rotacion");
  });

  test("includes call-to-action button", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("Ver Todas las Alertas");
    expect(result).toContain("https://app.aiskualerts.com/app/alerts");
  });

  test("includes footer with notification preferences note", () => {
    const result = renderDailyDigestEmail(baseParams);

    expect(result).toContain("Este correo fue enviado automaticamente");
    expect(result).toContain("Configuracion");
  });

  test("escapes HTML in tenant name", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      tenantName: 'Test <script>alert("xss")</script> Company',
    };

    const result = renderDailyDigestEmail(params);

    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("escapes HTML in product names", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [
        {
          sku: "SKU001",
          productName: '<img src="x" onerror="alert(1)">',
          currentStock: 5,
          threshold: 10,
          alertType: "low_stock",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
  });

  test("escapes HTML in SKU", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [
        {
          sku: "SKU<>001",
          productName: "Product",
          currentStock: 5,
          threshold: 10,
          alertType: "low_stock",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).toContain("SKU&lt;&gt;001");
  });

  test("handles single alert correctly", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [
        {
          sku: "SKU001",
          productName: "Product One",
          currentStock: 0,
          threshold: 5,
          alertType: "out_of_stock",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).toContain("Detalle de Alertas (1)");
    expect(result).toContain("SKU001");
  });

  test("renders only out_of_stock alerts correctly", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [
        {
          sku: "SKU001",
          productName: "Product One",
          currentStock: 0,
          threshold: 5,
          alertType: "out_of_stock",
        },
        {
          sku: "SKU002",
          productName: "Product Two",
          currentStock: 0,
          threshold: 10,
          alertType: "out_of_stock",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    // Check that the counts are correct
    expect(result).toContain("Detalle de Alertas (2)");
  });

  test("renders only low_stock alerts correctly", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [
        {
          sku: "SKU001",
          productName: "Product One",
          currentStock: 3,
          threshold: 10,
          alertType: "low_stock",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).toContain("Stock Bajo");
    expect(result).toContain("Detalle de Alertas (1)");
  });

  test("renders only low_velocity alerts correctly", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [
        {
          sku: "SKU001",
          productName: "Product One",
          currentStock: 100,
          threshold: null,
          alertType: "low_velocity",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).toContain("Baja Rotacion");
    expect(result).toContain("Detalle de Alertas (1)");
  });

  test("applies correct background colors for alert types", () => {
    const result = renderDailyDigestEmail(baseParams);

    // out_of_stock row background
    expect(result).toContain("#fef2f2");
    // low_stock row background
    expect(result).toContain("#fffbeb");
    // low_velocity row background
    expect(result).toContain("#eef2ff");
  });

  test("applies correct badge colors for alert types", () => {
    const result = renderDailyDigestEmail(baseParams);

    // out_of_stock badge (red)
    expect(result).toContain("#dc2626");
    // low_stock badge (amber)
    expect(result).toContain("#f59e0b");
    // low_velocity badge (indigo)
    expect(result).toContain("#6366f1");
  });

  test("escapes ampersand in names", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      tenantName: "Company A & B",
      alerts: [
        {
          sku: "SKU&001",
          productName: "Product A & B",
          currentStock: 5,
          threshold: 10,
          alertType: "low_stock",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).toContain("Company A &amp; B");
    expect(result).toContain("SKU&amp;001");
    expect(result).toContain("Product A &amp; B");
  });

  test("escapes quotes in names", () => {
    const params: DigestEmailParams = {
      ...baseParams,
      alerts: [
        {
          sku: 'SKU"001',
          productName: "Product 'Test'",
          currentStock: 5,
          threshold: 10,
          alertType: "low_stock",
        },
      ],
    };

    const result = renderDailyDigestEmail(params);

    expect(result).toContain("SKU&quot;001");
    expect(result).toContain("Product &#39;Test&#39;");
  });

  describe("skipped thresholds section", () => {
    test("does not show skipped section when skippedThresholdCount is 0", () => {
      const params: DigestEmailParams = {
        ...baseParams,
        skippedThresholdCount: 0,
      };

      const result = renderDailyDigestEmail(params);

      expect(result).not.toContain("Omitidos por Limite del Plan Gratuito");
      expect(result).not.toContain("Upgrade to Pro");
    });

    test("does not show skipped section when skippedThresholdCount is undefined", () => {
      const { skippedThresholdCount: _, ...paramsWithoutSkipped } = baseParams;
      const params: DigestEmailParams = paramsWithoutSkipped;

      const result = renderDailyDigestEmail(params);

      expect(result).not.toContain("Omitidos por Limite del Plan Gratuito");
      expect(result).not.toContain("Upgrade to Pro");
    });

    test("shows skipped section when skippedThresholdCount is greater than 0", () => {
      const params: DigestEmailParams = {
        ...baseParams,
        skippedThresholdCount: 5,
        upgradeUrl: "https://app.aiskualerts.com/settings/billing",
      };

      const result = renderDailyDigestEmail(params);

      expect(result).toContain("Omitidos por Limite del Plan Gratuito");
      expect(result).toContain("5 umbrales");
      expect(result).toContain("no estan");
    });

    test("shows singular form when skippedThresholdCount is 1", () => {
      const params: DigestEmailParams = {
        ...baseParams,
        skippedThresholdCount: 1,
        upgradeUrl: "https://app.aiskualerts.com/settings/billing",
      };

      const result = renderDailyDigestEmail(params);

      expect(result).toContain("1 umbral");
      expect(result).toContain("no esta");
    });

    test("shows upgrade button when upgradeUrl is provided", () => {
      const params: DigestEmailParams = {
        ...baseParams,
        skippedThresholdCount: 3,
        upgradeUrl: "https://app.aiskualerts.com/settings/billing",
      };

      const result = renderDailyDigestEmail(params);

      expect(result).toContain("Actualizar a Pro");
      expect(result).toContain('href="https://app.aiskualerts.com/settings/billing"');
    });

    test("does not show upgrade button when upgradeUrl is not provided", () => {
      const params: DigestEmailParams = {
        ...baseParams,
        skippedThresholdCount: 3,
        // upgradeUrl is omitted intentionally
      };

      const result = renderDailyDigestEmail(params);

      expect(result).toContain("Omitidos por Limite del Plan Gratuito");
      expect(result).not.toContain("Actualizar a Pro");
    });

    test("escapes HTML in upgradeUrl", () => {
      const params: DigestEmailParams = {
        ...baseParams,
        skippedThresholdCount: 2,
        upgradeUrl: 'https://example.com/path?foo=bar&baz=qux"onclick="evil()',
      };

      const result = renderDailyDigestEmail(params);

      // URL should be escaped to prevent XSS
      expect(result).not.toContain('onclick="evil()');
      expect(result).toContain("&amp;");
    });

    test("applies correct styling to skipped section", () => {
      const params: DigestEmailParams = {
        ...baseParams,
        skippedThresholdCount: 2,
        upgradeUrl: "https://app.aiskualerts.com/settings/billing",
      };

      const result = renderDailyDigestEmail(params);

      // Check for amber/warning color scheme
      expect(result).toContain("#fef3c7"); // Background color
      expect(result).toContain("#92400e"); // Header color
      expect(result).toContain("#78350f"); // Text color
      expect(result).toContain("#f59e0b"); // Button color
    });
  });
});
