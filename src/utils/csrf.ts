import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * CSRF protection using double-submit cookie pattern with HMAC signing
 *
 * Flow:
 * 1. Server generates a CSRF token and sets it as a cookie
 * 2. Frontend reads the token from the cookie and sends it in X-CSRF-Token header
 * 3. Server validates that the header matches the cookie
 * 4. HMAC signature prevents token forgery
 */

export interface CSRFConfig {
  /** Secret key for HMAC signing (at least 32 characters) */
  secret: string;
  /** Token validity period in milliseconds (default: 24 hours) */
  tokenTtlMs?: number;
  /** Cookie name (default: csrf_token) */
  cookieName?: string;
  /** Header name (default: X-CSRF-Token) */
  headerName?: string;
}

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_COOKIE_NAME = "csrf_token";
const DEFAULT_HEADER_NAME = "X-CSRF-Token";
const TOKEN_BYTES = 32;

/**
 * Generates an HMAC signature for a token
 */
function signToken(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Generates a new CSRF token
 * Format: timestamp.randomData.signature
 *
 * @param secret - The secret key for signing
 * @returns The signed CSRF token
 */
export function generateCSRFToken(secret: string): string {
  if (!secret || secret.length < 32) {
    throw new Error("CSRF secret must be at least 32 characters");
  }

  const timestamp = Date.now().toString(36);
  const randomData = randomBytes(TOKEN_BYTES).toString("base64url");
  const payload = `${timestamp}.${randomData}`;
  const signature = signToken(payload, secret);

  return `${payload}.${signature}`;
}

/**
 * Validates a CSRF token
 *
 * @param token - The token to validate
 * @param secret - The secret key for verification
 * @param tokenTtlMs - Maximum token age in milliseconds
 * @returns true if the token is valid
 */
export function validateCSRFToken(
  token: string,
  secret: string,
  tokenTtlMs: number = DEFAULT_TOKEN_TTL_MS
): boolean {
  if (!token || !secret) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [timestamp, randomData, signature] = parts;

  if (!timestamp || !randomData || !signature) {
    return false;
  }

  // Verify signature
  const payload = `${timestamp}.${randomData}`;
  const expectedSignature = signToken(payload, secret);

  // Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  // Verify token hasn't expired
  const tokenTime = parseInt(timestamp, 36);
  const now = Date.now();

  if (isNaN(tokenTime) || now - tokenTime > tokenTtlMs) {
    return false;
  }

  return true;
}

/**
 * Extracts CSRF token from cookie header
 *
 * @param cookieHeader - The Cookie header value
 * @param cookieName - The name of the CSRF cookie
 * @returns The token value or null if not found
 */
export function extractCSRFTokenFromCookie(
  cookieHeader: string | null,
  cookieName: string = DEFAULT_COOKIE_NAME
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === cookieName) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

/**
 * Creates a Set-Cookie header value for the CSRF token
 *
 * @param token - The CSRF token
 * @param options - Cookie options
 * @returns The Set-Cookie header value
 */
export function createCSRFCookie(
  token: string,
  options: {
    cookieName?: string;
    maxAge?: number;
    secure?: boolean;
    path?: string;
  } = {}
): string {
  const {
    cookieName = DEFAULT_COOKIE_NAME,
    maxAge = Math.floor(DEFAULT_TOKEN_TTL_MS / 1000),
    secure = process.env.NODE_ENV === "production",
    path = "/",
  } = options;

  const parts = [
    `${cookieName}=${token}`,
    `Path=${path}`,
    `Max-Age=${String(maxAge)}`,
    "SameSite=Strict",
  ];

  // Note: CSRF cookie should NOT be HttpOnly so JavaScript can read it
  // This is intentional for the double-submit pattern
  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Creates a CSRF service with bound configuration
 */
export function createCSRFService(config: CSRFConfig) {
  const {
    secret,
    tokenTtlMs = DEFAULT_TOKEN_TTL_MS,
    cookieName = DEFAULT_COOKIE_NAME,
    headerName = DEFAULT_HEADER_NAME,
  } = config;

  return {
    /**
     * Generate a new CSRF token
     */
    generateToken: () => generateCSRFToken(secret),

    /**
     * Validate a CSRF token
     */
    validateToken: (token: string) => validateCSRFToken(token, secret, tokenTtlMs),

    /**
     * Create a Set-Cookie header for the CSRF token
     */
    createCookie: (token: string, options?: { secure?: boolean; maxAge?: number }) =>
      createCSRFCookie(token, { cookieName, ...options }),

    /**
     * Extract token from cookie header
     */
    extractFromCookie: (cookieHeader: string | null) =>
      extractCSRFTokenFromCookie(cookieHeader, cookieName),

    /**
     * Extract token from request header
     */
    extractFromHeader: (request: Request) => request.headers.get(headerName),

    /**
     * Validate CSRF token from request (compares header and cookie)
     */
    validateRequest: (request: Request): boolean => {
      const cookieHeader = request.headers.get("Cookie");
      const cookieToken = extractCSRFTokenFromCookie(cookieHeader, cookieName);
      const headerToken = request.headers.get(headerName);

      // Both must be present
      if (!cookieToken || !headerToken) {
        return false;
      }

      // Tokens must match (double-submit validation)
      if (cookieToken !== headerToken) {
        return false;
      }

      // Token must be valid (not expired, valid signature)
      return validateCSRFToken(cookieToken, secret, tokenTtlMs);
    },

    /**
     * Get the header name for documentation/client use
     */
    getHeaderName: () => headerName,

    /**
     * Get the cookie name for documentation/client use
     */
    getCookieName: () => cookieName,
  };
}

export type CSRFService = ReturnType<typeof createCSRFService>;
