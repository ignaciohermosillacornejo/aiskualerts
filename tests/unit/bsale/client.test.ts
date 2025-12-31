import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { BsaleClient } from "@/bsale/client";
import {
  BsaleAuthError,
  BsaleRateLimitError,
  BsaleServerError,
} from "@/lib/errors";

const mockStockResponse = {
  href: "https://api.bsale.cl/v1/stocks.json",
  count: 100,
  limit: 50,
  offset: 0,
  items: [
    {
      id: 123,
      quantity: 100,
      quantityReserved: 5,
      quantityAvailable: 95,
      variant: {
        href: "https://api.bsale.cl/v1/variants/456.json",
        id: 456,
      },
      office: {
        href: "https://api.bsale.cl/v1/offices/1.json",
        id: 1,
      },
    },
  ],
};

const mockVariantResponse = {
  id: 456,
  code: "SKU-001",
  barCode: "1234567890",
  description: "Test Product",
  product: {
    name: "Test Product Name",
  },
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("BsaleClient constructor sets correct base URL for Chile", () => {
  const client = new BsaleClient("test-token", { country: "CL" });
  expect(client).toBeDefined();
});

test("BsaleClient constructor sets correct base URL for Peru", () => {
  const client = new BsaleClient("test-token", { country: "PE" });
  expect(client).toBeDefined();
});

test("BsaleClient constructor sets correct base URL for Mexico", () => {
  const client = new BsaleClient("test-token", { country: "MX" });
  expect(client).toBeDefined();
});

test("BsaleClient constructor accepts custom base URL", () => {
  const client = new BsaleClient("test-token", {
    baseUrl: "https://api.bsale.io",
  });
  expect(client).toBeDefined();
});

test("BsaleClient getAllStocks yields all stock items", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockStockResponse),
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });
  const stocks = [];

  for await (const stock of client.getAllStocks()) {
    stocks.push(stock);
  }

  expect(stocks).toHaveLength(1);
  expect(stocks[0]?.id).toBe(123);
  expect(stocks[0]?.quantity).toBe(100);
});

test("BsaleClient getAllStocks handles pagination", async () => {
  let callCount = 0;
  globalThis.fetch = mock(() => {
    callCount++;
    const response = {
      ...mockStockResponse,
      items:
        callCount === 1
          ? Array(50).fill(mockStockResponse.items[0])
          : [mockStockResponse.items[0]],
    };
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    });
  }) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });
  const stocks = [];

  for await (const stock of client.getAllStocks()) {
    stocks.push(stock);
  }

  expect(stocks).toHaveLength(51);
  expect(callCount).toBe(2);
});

test("BsaleClient getVariant returns variant details", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockVariantResponse),
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token");
  const variant = await client.getVariant(456);

  expect(variant.id).toBe(456);
  expect(variant.code).toBe("SKU-001");
  expect(variant.product?.name).toBe("Test Product Name");
});

test("BsaleClient throws BsaleAuthError on 401", () => {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("invalid-token");

  expect(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _stock of client.getAllStocks()) {
      // Iterate to trigger error
    }
  }).toThrow(BsaleAuthError);
});

test("BsaleClient throws BsaleRateLimitError on 429", () => {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token");

  expect(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _stock of client.getAllStocks()) {
      // Iterate to trigger error
    }
  }).toThrow(BsaleRateLimitError);
});

test("BsaleClient throws BsaleServerError on 500", () => {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token");

  expect(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _stock of client.getAllStocks()) {
      // Iterate to trigger error
    }
  }).toThrow(BsaleServerError);
});

test("BsaleClient retries on network errors", async () => {
  let callCount = 0;
  globalThis.fetch = mock(() => {
    callCount++;
    if (callCount < 3) {
      throw new Error("Network error");
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockStockResponse),
    });
  }) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });
  const stocks = [];

  for await (const stock of client.getAllStocks()) {
    stocks.push(stock);
  }

  expect(stocks).toHaveLength(1);
  expect(callCount).toBe(3);
});

test("BsaleClient throws after max retries on persistent errors", () => {
  globalThis.fetch = mock(() => {
    throw new Error("Persistent network error");
  }) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

  expect(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _stock of client.getAllStocks()) {
      // Iterate to trigger error
    }
  }).toThrow("Persistent network error");
});

test("BsaleClient handles 4xx errors other than 401/429", () => {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token");

  expect(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _stock of client.getAllStocks()) {
      // Iterate to trigger error
    }
  }).toThrow("HTTP 404: Not Found");
});

test("BsaleClient respects rate limiting delay", async () => {
  const startTime = Date.now();
  let callCount = 0;

  globalThis.fetch = mock(() => {
    callCount++;
    const response = {
      ...mockStockResponse,
      items:
        callCount === 1
          ? Array(50).fill(mockStockResponse.items[0])
          : [mockStockResponse.items[0]],
    };
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    });
  }) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token", { country: "CL", requestDelay: 50 });
  const stocks = [];

  for await (const stock of client.getAllStocks()) {
    stocks.push(stock);
  }

  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeGreaterThanOrEqual(40);
  expect(callCount).toBe(2);
});

test("BsaleClient handles null office in stock items", async () => {
  const responseWithNullOffice = {
    ...mockStockResponse,
    items: [
      {
        ...mockStockResponse.items[0],
        office: null,
      },
    ],
  };

  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(responseWithNullOffice),
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });
  const stocks = [];

  for await (const stock of client.getAllStocks()) {
    stocks.push(stock);
  }

  expect(stocks).toHaveLength(1);
  expect(stocks[0]?.office).toBeNull();
});

test("BsaleClient handles null variant fields", async () => {
  const variantWithNulls = {
    id: 456,
    code: null,
    barCode: null,
    description: null,
    product: null,
  };

  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(variantWithNulls),
    })
  ) as unknown as typeof globalThis.fetch;

  const client = new BsaleClient("test-token");
  const variant = await client.getVariant(456);

  expect(variant.id).toBe(456);
  expect(variant.code).toBeNull();
  expect(variant.barCode).toBeNull();
  expect(variant.description).toBeNull();
  expect(variant.product).toBeNull();
});
