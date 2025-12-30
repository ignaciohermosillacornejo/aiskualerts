import {
  StockResponseSchema,
  VariantSchema,
  type StockItem,
  type Variant,
} from "./types";
import {
  BsaleAuthError,
  BsaleRateLimitError,
  BsaleServerError,
} from "@/lib/errors";

type Country = "CL" | "PE" | "MX";

export interface BsaleClientOptions {
  country?: Country;
  requestDelay?: number;
  baseUrl?: string;
}

export class BsaleClient {
  private baseUrl: string;
  private accessToken: string;
  private requestDelay: number;

  constructor(accessToken: string, options: BsaleClientOptions = {}) {
    this.accessToken = accessToken;
    this.baseUrl =
      options.baseUrl ?? `https://api.bsale.${(options.country ?? "CL").toLowerCase()}`;
    this.requestDelay = options.requestDelay ?? 100;
  }

  async *getAllStocks(): AsyncGenerator<StockItem, void, undefined> {
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchWithRetry(
        `/v1/stocks.json?limit=${String(limit)}&offset=${String(offset)}`
      );
      const data = StockResponseSchema.parse(response);

      for (const item of data.items) {
        yield item;
      }

      if (data.items.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        await this.delay();
      }
    }
  }

  async getVariant(variantId: number): Promise<Variant> {
    const response = await this.fetchWithRetry(
      `/v1/variants/${String(variantId)}.json`
    );
    return VariantSchema.parse(response);
  }

  private async fetchWithRetry(
    path: string,
    retries = 3
  ): Promise<unknown> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          headers: { access_token: this.accessToken },
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new BsaleAuthError("Token expired or invalid");
          }
          if (response.status === 429) {
            throw new BsaleRateLimitError("Rate limit exceeded");
          }
          if (response.status >= 500) {
            throw new BsaleServerError(
              `Server error: HTTP ${String(response.status)}`,
              response.status
            );
          }
          throw new Error(
            `HTTP ${String(response.status)}: ${response.statusText}`
          );
        }

        return await response.json();
      } catch (error) {
        if (
          error instanceof BsaleAuthError ||
          error instanceof BsaleRateLimitError
        ) {
          throw error;
        }

        if (attempt === retries) {
          throw error;
        }

        await this.delay(attempt * 1000);
      }
    }

    throw new Error("Unexpected error in fetchWithRetry");
  }

  private delay(ms?: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, ms ?? this.requestDelay)
    );
  }
}
