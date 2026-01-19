import { test, expect, describe } from "bun:test";

/**
 * Price formatting logic used in Products.tsx:
 * `$ ${Math.trunc(Number(product.unitPrice)).toLocaleString("es-CL")}`
 */
function formatPrice(unitPrice: number | string | null): string {
  if (unitPrice == null) {
    return "-";
  }
  return `$ ${Math.trunc(Number(unitPrice)).toLocaleString("es-CL")}`;
}

describe("Price Formatting", () => {
  describe("formatPrice", () => {
    test("formats integer prices correctly", () => {
      expect(formatPrice(800)).toBe("$ 800");
      expect(formatPrice(990)).toBe("$ 990");
    });

    test("removes decimal places from prices", () => {
      expect(formatPrice(800.0)).toBe("$ 800");
      expect(formatPrice(800.99)).toBe("$ 800");
      expect(formatPrice(2090.5)).toBe("$ 2.090");
    });

    test("adds thousands separator for large prices", () => {
      expect(formatPrice(1000)).toBe("$ 1.000");
      expect(formatPrice(12990)).toBe("$ 12.990");
      expect(formatPrice(29990)).toBe("$ 29.990");
      expect(formatPrice(100000)).toBe("$ 100.000");
      expect(formatPrice(1000000)).toBe("$ 1.000.000");
    });

    test("handles string prices from PostgreSQL DECIMAL", () => {
      expect(formatPrice("800.00")).toBe("$ 800");
      expect(formatPrice("2090.00")).toBe("$ 2.090");
      expect(formatPrice("12990.00")).toBe("$ 12.990");
      expect(formatPrice("19990.50")).toBe("$ 19.990");
    });

    test("returns dash for null prices", () => {
      expect(formatPrice(null)).toBe("-");
    });

    test("handles zero price", () => {
      expect(formatPrice(0)).toBe("$ 0");
      expect(formatPrice("0.00")).toBe("$ 0");
    });

    test("handles negative prices", () => {
      expect(formatPrice(-500)).toBe("$ -500");
      expect(formatPrice("-1000.00")).toBe("$ -1.000");
    });
  });
});
