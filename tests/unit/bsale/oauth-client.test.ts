/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, beforeEach, mock } from "bun:test";
import { BsaleOAuthClient, BsaleOAuthError } from "@/bsale/oauth-client";

describe("BsaleOAuthClient", () => {
  let client: BsaleOAuthClient;
  const mockConfig = {
    appId: "test-app-id",
    integratorToken: "test-integrator-token",
    redirectUri: "https://example.com/callback",
  };

  beforeEach(() => {
    client = new BsaleOAuthClient(mockConfig);
  });

  describe("getAuthorizationUrl", () => {
    test("returns correct authorization URL with default base URL", () => {
      const url = client.getAuthorizationUrl("12345678-9");

      expect(url).toBe(
        "https://oauth.bsale.io/login?app_id=test-app-id&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&client_code=12345678-9"
      );
    });

    test("returns correct authorization URL with custom base URL", () => {
      const customClient = new BsaleOAuthClient({
        ...mockConfig,
        oauthBaseUrl: "https://custom.bsale.com",
      });

      const url = customClient.getAuthorizationUrl("12345678-9");

      expect(url).toBe(
        "https://custom.bsale.com/login?app_id=test-app-id&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&client_code=12345678-9"
      );
    });

    test("correctly encodes redirect URI with special characters", () => {
      const specialClient = new BsaleOAuthClient({
        ...mockConfig,
        redirectUri: "https://example.com/callback?state=test&foo=bar",
      });

      const url = specialClient.getAuthorizationUrl("12345678-9");

      expect(url).toContain("redirect_uri=https%3A%2F%2Fexample.com%2Fcallback%3Fstate%3Dtest%26foo%3Dbar");
    });
  });

  describe("exchangeCodeForToken", () => {
    beforeEach(() => {
      globalThis.fetch = mock(() => Promise.resolve({} as Response)) as unknown as typeof fetch;
    });

    test("exchanges code for token successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          code: 200,
          data: {
            accessToken: "test-access-token",
            clientName: "Test Company",
            clientCode: "12345678-9",
          },
        }),
      };

      globalThis.fetch = mock(() => Promise.resolve(mockResponse as Response)) as unknown as typeof fetch;

      const result = await client.exchangeCodeForToken("auth-code-123");

      expect(result.code).toBe(200);
      expect(result.data.accessToken).toBe("test-access-token");
      expect(result.data.clientName).toBe("Test Company");
      expect(result.data.clientCode).toBe("12345678-9");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://oauth.bsale.io/gateway/oauth_response.json",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: "auth-code-123",
            usrToken: "test-integrator-token",
            appId: "test-app-id",
          }),
        }
      );
    });

    test("throws error when HTTP request fails", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 400,
        } as Response)
      ) as unknown as typeof fetch;

      await expect(client.exchangeCodeForToken("bad-code")).rejects.toThrow(
        BsaleOAuthError
      );
      await expect(client.exchangeCodeForToken("bad-code")).rejects.toThrow(
        "OAuth token exchange failed: HTTP 400"
      );
    });

    test("throws error when response code is not 200", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          code: 401,
          data: null,
        }),
      };

      globalThis.fetch = mock(() => Promise.resolve(mockResponse as Response)) as unknown as typeof fetch;

      await expect(client.exchangeCodeForToken("bad-code")).rejects.toThrow(
        BsaleOAuthError
      );
      await expect(client.exchangeCodeForToken("bad-code")).rejects.toThrow(
        "OAuth token exchange failed: 401"
      );
    });

    test("throws error when response is invalid", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          invalid: "response",
        }),
      };

      globalThis.fetch = mock(() => Promise.resolve(mockResponse as Response)) as unknown as typeof fetch;

      await expect(client.exchangeCodeForToken("bad-code")).rejects.toThrow();
    });

    test("uses custom OAuth base URL", async () => {
      const customClient = new BsaleOAuthClient({
        ...mockConfig,
        oauthBaseUrl: "https://custom.bsale.com",
      });

      const mockResponse = {
        ok: true,
        json: async () => ({
          code: 200,
          data: {
            accessToken: "test-token",
            clientName: "Test",
            clientCode: "123",
          },
        }),
      };

      globalThis.fetch = mock(() => Promise.resolve(mockResponse as Response)) as unknown as typeof fetch;

      await customClient.exchangeCodeForToken("code");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://custom.bsale.com/gateway/oauth_response.json",
        expect.any(Object)
      );
    });
  });
});
