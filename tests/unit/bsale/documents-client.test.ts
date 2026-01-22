import { test, expect, beforeEach, afterEach, mock, describe } from "bun:test";
import { BsaleClient } from "@/bsale/client";

const mockDocumentsResponse = {
  href: "https://api.bsale.cl/v1/documents.json",
  count: 2,
  limit: 50,
  offset: 0,
  items: [
    {
      id: 1001,
      emissionDate: 1704067200, // 2024-01-01 00:00:00 UTC
      state: 0,
      details: {
        items: [
          {
            id: 5001,
            quantity: 10,
            variant: {
              id: 456,
              code: "SKU-001",
            },
          },
          {
            id: 5002,
            quantity: 5,
            variant: {
              id: 789,
              code: "SKU-002",
            },
          },
        ],
      },
    },
    {
      id: 1002,
      emissionDate: 1704153600, // 2024-01-02 00:00:00 UTC
      state: 0,
      details: {
        items: [
          {
            id: 5003,
            quantity: 3,
            variant: {
              id: 456,
              code: "SKU-001",
            },
          },
        ],
      },
    },
  ],
  next: null,
};

const mockEmptyDocumentsResponse = {
  href: "https://api.bsale.cl/v1/documents.json",
  count: 0,
  limit: 50,
  offset: 0,
  items: [],
  next: null,
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("BsaleClient.getDocuments", () => {
  test("calls API with correct date range parameters", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });
    const startDate = new Date("2024-01-01T00:00:00Z");
    const endDate = new Date("2024-01-31T23:59:59Z");

    await client.getDocuments({ startDate, endDate });

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    // URL-decode to check actual parameters
    const decodedUrl = decodeURIComponent(capturedUrl);
    expect(decodedUrl).toContain("/v1/documents.json");
    expect(decodedUrl).toContain(`emissiondaterange=[${startTimestamp},${endTimestamp}]`);
  });

  test("includes expand parameter when specified", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    await client.getDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
      expand: ["details", "details.variant"],
    });

    const decodedUrl = decodeURIComponent(capturedUrl);
    expect(decodedUrl).toContain("expand=[details,details.variant]");
  });

  test("includes state parameter when specified", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    await client.getDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
      state: 0,
    });

    expect(capturedUrl).toContain("state=0");
  });

  test("handles pagination offset", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    await client.getDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
      limit: 25,
      offset: 50,
    });

    expect(capturedUrl).toContain("limit=25");
    expect(capturedUrl).toContain("offset=50");
  });

  test("uses default limit of 50 when not specified", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    await client.getDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });

    expect(capturedUrl).toContain("limit=50");
  });

  test("returns parsed documents response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse),
      })
    ) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    const result = await client.getDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });

    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe(1001);
    expect(result.items[0]?.emissionDate).toBe(1704067200);
    expect(result.items[0]?.details.items).toHaveLength(2);
    expect(result.items[0]?.details.items[0]?.quantity).toBe(10);
    expect(result.items[0]?.details.items[0]?.variant.code).toBe("SKU-001");
  });
});

describe("BsaleClient.getAllDocuments", () => {
  test("fetches all pages until no more results", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        // First page - full page of 50 items
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockDocumentsResponse,
              count: 75,
              items: Array(50).fill(mockDocumentsResponse.items[0]),
              next: "https://api.bsale.cl/v1/documents.json?offset=50",
            }),
        });
      } else {
        // Second page - less than 50 items (last page)
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockDocumentsResponse,
              count: 75,
              offset: 50,
              items: Array(25).fill(mockDocumentsResponse.items[1]),
              next: null,
            }),
        });
      }
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    const result = await client.getAllDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });

    expect(callCount).toBe(2);
    expect(result).toHaveLength(75);
  });

  test("returns empty array when no documents", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockEmptyDocumentsResponse),
      })
    ) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    const result = await client.getAllDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  test("passes expand parameter to each page request", async () => {
    const capturedUrls: string[] = [];
    let callCount = 0;
    globalThis.fetch = mock((url: string) => {
      capturedUrls.push(url);
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockDocumentsResponse,
              items: Array(50).fill(mockDocumentsResponse.items[0]),
              next: "https://api.bsale.cl/v1/documents.json?offset=50",
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockDocumentsResponse,
            items: [mockDocumentsResponse.items[0]],
            next: null,
          }),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    await client.getAllDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
      expand: ["details"],
    });

    const decodedUrl0 = decodeURIComponent(capturedUrls[0] ?? "");
    const decodedUrl1 = decodeURIComponent(capturedUrls[1] ?? "");
    expect(decodedUrl0).toContain("expand=[details]");
    expect(decodedUrl1).toContain("expand=[details]");
  });

  test("stops fetching when items length is less than limit", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockDocumentsResponse,
            items: [mockDocumentsResponse.items[0]], // Only 1 item, less than 50
          }),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    const result = await client.getAllDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });

    expect(callCount).toBe(1);
    expect(result).toHaveLength(1);
  });

  test("passes state parameter to getDocuments", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse),
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new BsaleClient("test-token", { country: "CL", requestDelay: 0 });

    await client.getAllDocuments({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
      state: 0,
    });

    expect(capturedUrl).toContain("state=0");
  });
});
