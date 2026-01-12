import { randomBytes, createHash } from "node:crypto";

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generate PKCE code verifier and challenge
 * Uses S256 method as recommended by RFC 7636
 */
export function generatePKCE(): PKCEChallenge {
  // Generate 32 random bytes for code verifier (43-128 chars after base64url encoding)
  const codeVerifier = randomBytes(32).toString("base64url");

  // Create S256 code challenge
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

/**
 * Generate CSRF state parameter
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}
