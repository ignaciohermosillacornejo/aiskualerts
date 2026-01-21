/**
 * OAuth Fixture for E2E Testing
 *
 * Provides route interception for Bsale OAuth and MercadoPago flows.
 * Mocks external API calls at the browser network level.
 */

import { test as base, type Route } from "@playwright/test";

export interface BsaleTenant {
  clientCode: string;
  clientName: string;
}

export interface BsaleSyncData {
  products: number;
  variants: number;
}

export interface OAuthFixture {
  /**
   * Mock the Bsale token exchange API response
   */
  mockTokenExchange: (tenant: BsaleTenant) => Promise<void>;

  /**
   * Intercept the OAuth redirect to Bsale and capture state/PKCE
   * Returns a function to get the captured state
   */
  interceptOAuthStart: () => Promise<{ getState: () => string; getRedirectUri: () => string }>;

  /**
   * Simulate Bsale redirecting back with an auth code
   */
  simulateOAuthCallback: (state: string, mockCode?: string) => Promise<void>;

  /**
   * Mock the Bsale API responses for sync operations
   */
  mockBsaleSync: (data: BsaleSyncData) => Promise<void>;

  /**
   * Mock MercadoPago checkout creation
   */
  mockMercadoPagoCheckout: () => Promise<void>;

  /**
   * Simulate successful MercadoPago payment callback
   */
  simulateMercadoPagoSuccess: () => Promise<void>;

  /**
   * Clear all route mocks
   */
  clearMocks: () => Promise<void>;
}

/**
 * Generate mock Bsale product data for sync
 */
function generateMockBsaleProducts(count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Test Product ${i + 1}`,
    variants: [
      {
        id: `variant-${i + 1}`,
        description: `Variant ${i + 1}`,
        code: `SKU-${String(i + 1).padStart(3, "0")}`,
      },
    ],
  }));
}

/**
 * Generate mock Bsale stock data
 */
function generateMockBsaleStock(variantCount: number): unknown[] {
  return Array.from({ length: variantCount }, (_, i) => ({
    variant: { id: `variant-${i + 1}` },
    quantity: Math.floor(Math.random() * 100),
    office: { id: "office-1", name: "Main Warehouse" },
  }));
}

/**
 * Extended test fixture with OAuth helpers
 */
export const oauthTest = base.extend<{ oauth: OAuthFixture }>({
  oauth: async ({ page, baseURL }, use) => {
    let capturedState = "";
    let capturedRedirectUri = "";
    const activeRoutes: (() => Promise<void>)[] = [];

    const fixture: OAuthFixture = {
      async mockTokenExchange(tenant: BsaleTenant): Promise<void> {
        await page.route("**/oauth.bsale.io/token**", async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                accessToken: `mock-access-token-${Date.now()}`,
                clientCode: tenant.clientCode,
                clientName: tenant.clientName,
              },
            }),
          });
        });
        activeRoutes.push(() => page.unroute("**/oauth.bsale.io/token**"));
      },

      async interceptOAuthStart(): Promise<{ getState: () => string; getRedirectUri: () => string }> {
        await page.route("**/oauth.bsale.io/authorize**", async (route: Route) => {
          const url = new URL(route.request().url());
          capturedState = url.searchParams.get("state") ?? "";
          capturedRedirectUri = url.searchParams.get("redirect_uri") ?? "";

          // Abort the navigation - we'll simulate the callback manually
          await route.abort();
        });
        activeRoutes.push(() => page.unroute("**/oauth.bsale.io/authorize**"));

        return {
          getState: () => capturedState,
          getRedirectUri: () => capturedRedirectUri,
        };
      },

      async simulateOAuthCallback(state: string, mockCode = "mock-auth-code"): Promise<void> {
        // Navigate directly to our callback URL as if Bsale redirected
        const callbackUrl = `${baseURL}/api/auth/bsale/callback?code=${mockCode}&state=${state}`;
        await page.goto(callbackUrl);
      },

      async mockBsaleSync(data: BsaleSyncData): Promise<void> {
        const products = generateMockBsaleProducts(data.products);
        const stock = generateMockBsaleStock(data.variants);

        // Mock products endpoint
        await page.route("**/api.bsale.io/**/products**", async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: products,
              count: products.length,
            }),
          });
        });
        activeRoutes.push(() => page.unroute("**/api.bsale.io/**/products**"));

        // Mock stock endpoint
        await page.route("**/api.bsale.io/**/stocks**", async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: stock,
              count: stock.length,
            }),
          });
        });
        activeRoutes.push(() => page.unroute("**/api.bsale.io/**/stocks**"));

        // Mock offices endpoint
        await page.route("**/api.bsale.io/**/offices**", async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [{ id: "office-1", name: "Main Warehouse" }],
              count: 1,
            }),
          });
        });
        activeRoutes.push(() => page.unroute("**/api.bsale.io/**/offices**"));

        // Mock price lists endpoint
        await page.route("**/api.bsale.io/**/price_lists**", async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [{ id: "price-1", name: "Default", isDefault: 1 }],
              count: 1,
            }),
          });
        });
        activeRoutes.push(() => page.unroute("**/api.bsale.io/**/price_lists**"));
      },

      async mockMercadoPagoCheckout(): Promise<void> {
        // Mock preference creation
        await page.route("**/api.mercadopago.com/checkout/preferences**", async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "mock-preference-id",
              init_point: `${baseURL}/api/billing/mock-success`,
              sandbox_init_point: `${baseURL}/api/billing/mock-success`,
            }),
          });
        });
        activeRoutes.push(() => page.unroute("**/api.mercadopago.com/checkout/preferences**"));
      },

      async simulateMercadoPagoSuccess(): Promise<void> {
        // Simulate webhook callback with successful payment
        await page.request.post(`${baseURL}/api/billing/webhook`, {
          data: {
            type: "payment",
            data: { id: "mock-payment-id" },
          },
          headers: { "Content-Type": "application/json" },
        });
      },

      async clearMocks(): Promise<void> {
        for (const unroute of activeRoutes) {
          await unroute();
        }
        activeRoutes.length = 0;
      },
    };

    await use(fixture);

    // Cleanup after test
    await fixture.clearMocks();
  },
});

export { expect } from "@playwright/test";
