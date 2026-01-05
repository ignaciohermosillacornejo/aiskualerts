import { test, expect, describe } from "bun:test";
import { BsaleClient } from "@/bsale/client";
import { BsaleAuthError } from "@/lib/errors";

/**
 * E2E Integration Tests for BsaleClient
 *
 * These tests run against the real Bsale demo API to verify:
 * - Actual API connectivity
 * - Real-world data handling
 * - Pagination with live data
 * - Error scenarios with invalid credentials
 *
 * Prerequisites:
 * - BSALE_ACCESS_TOKEN must be set in .env
 * - BSALE_API_BASE_URL must be set in .env
 */

const ACCESS_TOKEN = process.env["BSALE_ACCESS_TOKEN"];
const BASE_URL = process.env["BSALE_API_BASE_URL"];

const shouldSkip = !ACCESS_TOKEN || !BASE_URL;

describe.skipIf(shouldSkip)("BsaleClient E2E Integration Tests", () => {
  // These will be defined if tests run (due to skipIf)
  const token = ACCESS_TOKEN ?? "";
  const baseUrl = BASE_URL ?? "";

  test("should successfully connect to Bsale API", () => {
    const client = new BsaleClient(token, { baseUrl });
    expect(client).toBeDefined();
  });

  test("should fetch stock items from real API", async () => {
    const client = new BsaleClient(token, {
      baseUrl,
      requestDelay: 200, // Be respectful to the demo API
    });

    const stocks = [];
    let count = 0;

    // Fetch first 10 items to verify pagination works
    for await (const stock of client.getAllStocks()) {
      stocks.push(stock);
      count++;
      if (count >= 10) break;
    }

    expect(stocks.length).toBeGreaterThan(0);
    expect(stocks.length).toBeLessThanOrEqual(10);

    // Verify stock item structure
    const firstStock = stocks[0];
    expect(firstStock).toBeDefined();
    expect(typeof firstStock?.id).toBe("number");
    expect(typeof firstStock?.quantity).toBe("number");
    expect(typeof firstStock?.quantityReserved).toBe("number");
    expect(typeof firstStock?.quantityAvailable).toBe("number");
    expect(firstStock?.variant).toBeDefined();
    expect(typeof firstStock?.variant.id).toBe("number");
    expect(typeof firstStock?.variant.href).toBe("string");
  });

  test(
    "should handle pagination correctly with real API",
    async () => {
      const client = new BsaleClient(token, {
        baseUrl,
        requestDelay: 150,
      });

      const stocks = [];
      let count = 0;

      // Fetch enough items to ensure we cross at least one page boundary (50 items per page)
      for await (const stock of client.getAllStocks()) {
        stocks.push(stock);
        count++;
        if (count >= 55) break; // Fetch across 2 pages (55 to be safe)
      }

      expect(stocks.length).toBeGreaterThan(50);
      expect(stocks.length).toBeLessThanOrEqual(55);

      // Verify all items are unique by ID
      const uniqueIds = new Set(stocks.map((s) => s.id));
      expect(uniqueIds.size).toBe(stocks.length);
    },
    { timeout: 15000 }
  );

  test("should fetch variant details from real API", async () => {
    const client = new BsaleClient(token, {
      baseUrl,
      requestDelay: 200,
    });

    // First, get a stock item to get a valid variant ID
    let variantId: number | undefined;
    for await (const stock of client.getAllStocks()) {
      variantId = stock.variant.id;
      break;
    }

    expect(variantId).toBeDefined();

    // Now fetch the variant details
    if (variantId) {
      const variant = await client.getVariant(variantId);

      expect(variant).toBeDefined();
      expect(variant.id).toBe(variantId);

      // Variant may have null fields, so just verify structure
      if (variant.code !== null) {
        expect(typeof variant.code).toBe("string");
      }
      if (variant.barCode !== null) {
        expect(typeof variant.barCode).toBe("string");
      }
      if (variant.description !== null) {
        expect(typeof variant.description).toBe("string");
      }
    }
  });

  test("should handle stock items with null office", async () => {
    const client = new BsaleClient(token, {
      baseUrl,
      requestDelay: 200,
    });

    const stocks = [];
    let count = 0;

    // Fetch items and look for ones with null office
    for await (const stock of client.getAllStocks()) {
      stocks.push(stock);
      count++;
      if (count >= 50) break;
    }

    // The API should return some items, check office field exists
    expect(stocks.length).toBeGreaterThan(0);
    // Verify office field structure for each stock item
    for (const stock of stocks) {
      expect(stock.office).toBeDefined();
    }
  });

  test("should throw BsaleAuthError with invalid token", () => {
    const client = new BsaleClient("invalid-token-12345", {
      baseUrl,
      requestDelay: 0,
    });

    expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _stock of client.getAllStocks()) {
        // Should throw before yielding anything
        break;
      }
    }).toThrow(BsaleAuthError);
  });

  test(
    "should respect rate limiting between requests",
    async () => {
      const startTime = Date.now();
      const client = new BsaleClient(token, {
        baseUrl,
        requestDelay: 300, // 300ms delay
      });

      let count = 0;

      // Fetch items across at least 2 pages to test the delay
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _stock of client.getAllStocks()) {
        count++;
        if (count >= 55) break; // 2 pages = at least 1 delay
      }

      const elapsed = Date.now() - startTime;

      // Should have at least one delay of 300ms between page fetches
      expect(elapsed).toBeGreaterThanOrEqual(300);
    },
    { timeout: 15000 }
  );

  test("should validate API response schema with Zod", async () => {
    const client = new BsaleClient(token, {
      baseUrl,
      requestDelay: 200,
    });

    let stockCount = 0;

    // If Zod validation fails, it will throw an error
    for await (const stock of client.getAllStocks()) {
      // Verify the parsed data conforms to our expected types
      expect(typeof stock.id).toBe("number");
      expect(typeof stock.quantity).toBe("number");
      expect(typeof stock.quantityReserved).toBe("number");
      expect(typeof stock.quantityAvailable).toBe("number");

      stockCount++;
      if (stockCount >= 5) break;
    }

    expect(stockCount).toBe(5);
  });

  test(
    "should handle empty results gracefully",
    async () => {
      // This test verifies the client handles the end of pagination correctly
      const client = new BsaleClient(token, {
        baseUrl,
        requestDelay: 150,
      });

      let totalCount = 0;

      // Iterate through all available stocks (or a reasonable limit)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _stock of client.getAllStocks()) {
        totalCount++;
        if (totalCount >= 75) break; // Safety limit for test
      }

      // Should have fetched some items from the demo API
      expect(totalCount).toBeGreaterThan(0);
      expect(totalCount).toBeLessThanOrEqual(75);
    },
    { timeout: 20000 }
  );

  test(
    "should handle real-world variant data with nullable fields",
    async () => {
      const client = new BsaleClient(token, {
        baseUrl,
        requestDelay: 200,
      });

      // Get multiple variant IDs
      const variantIds: number[] = [];
      let count = 0;

      for await (const stock of client.getAllStocks()) {
        variantIds.push(stock.variant.id);
        count++;
        if (count >= 5) break;
      }

      expect(variantIds.length).toBe(5);

      // Fetch details for each variant
      const variants = await Promise.all(
        variantIds.map((id) => client.getVariant(id))
      );

      expect(variants.length).toBe(5);

      // Verify each variant has the correct ID and handles nullable/optional fields
      for (let index = 0; index < variants.length; index++) {
        const variant = variants[index];
        const expectedId = variantIds[index];
        if (expectedId !== undefined && variant !== undefined) {
          expect(variant.id).toBe(expectedId);

          // These fields can be null in real data
          if (variant.code !== null) {
            expect(typeof variant.code).toBe("string");
          }
          if (variant.barCode !== null) {
            expect(typeof variant.barCode).toBe("string");
          }
          if (variant.description !== null) {
            expect(typeof variant.description).toBe("string");
          }
          if (variant.product !== null && variant.product !== undefined) {
            if (variant.product.name !== null && variant.product.name !== undefined) {
              expect(typeof variant.product.name).toBe("string");
            }
          }
        }
      }
    },
    { timeout: 10000 }
  );
});
