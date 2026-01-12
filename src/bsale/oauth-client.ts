import { z } from "zod";

export interface BsaleOAuthConfig {
  appId: string;
  integratorToken: string;
  redirectUri: string;
  oauthBaseUrl?: string;
}

const TokenResponseSchema = z.object({
  code: z.number(),
  data: z.object({
    accessToken: z.string(),
    clientName: z.string(),
    clientCode: z.string(),
  }),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export class BsaleOAuthClient {
  private config: BsaleOAuthConfig;
  private oauthBaseUrl: string;

  constructor(config: BsaleOAuthConfig) {
    this.config = config;
    this.oauthBaseUrl = config.oauthBaseUrl ?? "https://oauth.bsale.io";
  }

  /**
   * Generate the OAuth authorization URL to redirect users to Bsale login
   * Includes PKCE code_challenge and CSRF state parameter for security
   */
  getAuthorizationUrl(
    clientCode: string,
    state: string,
    codeChallenge: string
  ): string {
    const params = new URLSearchParams({
      app_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      client_code: clientCode,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return `${this.oauthBaseUrl}/login?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * Includes PKCE code_verifier for security
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string
  ): Promise<TokenResponse> {
    const response = await fetch(
      `${this.oauthBaseUrl}/gateway/oauth_response.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          usrToken: this.config.integratorToken,
          appId: this.config.appId,
          code_verifier: codeVerifier,
        }),
      }
    );

    if (!response.ok) {
      throw new BsaleOAuthError(`OAuth token exchange failed: HTTP ${String(response.status)}`);
    }

    const data = await response.json();

    // Check response code before Zod validation
    if (typeof data === "object" && data !== null && "code" in data && data.code !== 200) {
      throw new BsaleOAuthError(`OAuth token exchange failed: ${String(data.code)}`);
    }

    const validated = TokenResponseSchema.parse(data);

    return validated;
  }
}

export class BsaleOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BsaleOAuthError";
  }
}
