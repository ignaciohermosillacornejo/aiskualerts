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
import { logger } from "@/utils/logger";
import {
  traceBsaleApi,
  recordDistribution,
  incrementCounter,
} from "@/monitoring/sentry";

type Country = "CL" | "PE" | "MX";

/** Default page size for Bsale API pagination */
const DEFAULT_PAGE_SIZE = 50;

/** Default delay between requests to respect rate limits (ms) */
const DEFAULT_REQUEST_DELAY = 100;

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
    this.requestDelay = options.requestDelay ?? DEFAULT_REQUEST_DELAY;
  }

  async *getAllStocks(): AsyncGenerator<StockItem, void, undefined> {
    let offset = 0;
    const limit = DEFAULT_PAGE_SIZE;
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

  /**
   * Fetch multiple variants by their IDs in batch.
   * Returns a Map where keys are variant IDs and values are Variant objects.
   * Missing or failed variants are not included in the result map.
   */
  async getVariantsBatch(variantIds: number[]): Promise<Map<number, Variant>> {
    const results = new Map<number, Variant>();
    const uniqueIds = [...new Set(variantIds)];

    // Process in chunks to avoid overwhelming the API
    const chunkSize = 10;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);

      const promises = chunk.map(async (id) => {
        try {
          const variant = await this.getVariant(id);
          return { id, variant };
        } catch (error) {
          // Log but don't fail the entire batch for individual variant failures
          logger.warn("Failed to fetch variant", { variantId: id, error: error instanceof Error ? error.message : "Unknown error" });
          return { id, variant: null };
        }
      });

      const chunkResults = await Promise.all(promises);

      for (const result of chunkResults) {
        if (result.variant !== null) {
          results.set(result.id, result.variant);
        }
      }

      // Add delay between chunks to respect rate limits
      if (i + chunkSize < uniqueIds.length) {
        await this.delay();
      }
    }

    return results;
  }

  private async fetchWithRetry(
    path: string,
    retries = 3
  ): Promise<unknown> {
    const startTime = Date.now();

    return traceBsaleApi(path, async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await fetch(`${this.baseUrl}${path}`, {
            headers: { access_token: this.accessToken },
          });

          // Record response status metrics
          incrementCounter("bsale.api.requests", 1, {
            status: String(response.status),
            endpoint: this.extractEndpoint(path),
          });

          if (!response.ok) {
            if (response.status === 401) {
              incrementCounter("bsale.api.errors", 1, { error_type: "auth" });
              throw new BsaleAuthError("Token expired or invalid");
            }
            if (response.status === 429) {
              incrementCounter("bsale.api.errors", 1, { error_type: "rate_limit" });
              throw new BsaleRateLimitError("Rate limit exceeded");
            }
            if (response.status >= 500) {
              incrementCounter("bsale.api.errors", 1, { error_type: "server" });
              throw new BsaleServerError(
                `Server error: HTTP ${String(response.status)}`,
                response.status
              );
            }
            throw new Error(
              `HTTP ${String(response.status)}: ${response.statusText}`
            );
          }

          const duration = Date.now() - startTime;
          recordDistribution("bsale.api.duration", duration, "millisecond", {
            endpoint: this.extractEndpoint(path),
          });

          return (await response.json()) as unknown;
        } catch (error) {
          if (
            error instanceof BsaleAuthError ||
            error instanceof BsaleRateLimitError
          ) {
            throw error;
          }

          if (attempt === retries) {
            incrementCounter("bsale.api.errors", 1, { error_type: "network" });
            throw error;
          }

          incrementCounter("bsale.api.retries", 1, {
            attempt: String(attempt),
            endpoint: this.extractEndpoint(path),
          });

          await this.delay(attempt * 1000);
        }
      }

      throw new Error("Unexpected error in fetchWithRetry");
    });
  }

  /**
   * Extract a normalized endpoint name from the path for metrics
   */
  private extractEndpoint(path: string): string {
    // Remove query params and normalize IDs
    const basePath = path.split("?")[0] ?? path;
    // Replace numeric IDs with placeholder
    return basePath.replace(/\/\d+/g, "/:id");
  }

  private delay(ms?: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, ms ?? this.requestDelay)
    );
  }
}
