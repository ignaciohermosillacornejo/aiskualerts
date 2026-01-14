import { ZodError } from "zod";

// Module-level CORS configuration (set via configureCors)
let corsConfig: {
  allowedOrigins: string[];
  nodeEnv: string;
} | null = null;

/**
 * Configure CORS settings for the application.
 * Must be called during server startup with config values.
 * @param config - CORS configuration from loadConfig()
 */
export function configureCors(config: { allowedOrigins: string[]; nodeEnv: string }): void {
  corsConfig = config;
}

/**
 * Reset CORS configuration (useful for testing)
 */
export function resetCorsConfig(): void {
  corsConfig = null;
}

/**
 * Get the current CORS configuration.
 * Falls back to parsing env vars if not configured (for backward compatibility).
 */
function getCorsConfig(): { allowedOrigins: string[]; nodeEnv: string } {
  if (corsConfig !== null) {
    return corsConfig;
  }

  // Fallback for when configureCors hasn't been called (e.g., direct test imports)
  const originsEnv = process.env["ALLOWED_ORIGINS"] ?? "";
  const allowedOrigins = originsEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const nodeEnv = process.env.NODE_ENV ?? "development";

  return { allowedOrigins, nodeEnv };
}

/**
 * Validate a request origin against the allowed origins list.
 * Returns the origin to use in CORS headers, or null if the origin is not allowed.
 *
 * @param requestOrigin - The Origin header from the request
 * @returns The validated origin or null if not allowed
 */
export function validateOrigin(requestOrigin: string | null): string | null {
  const { allowedOrigins, nodeEnv } = getCorsConfig();

  // In test/development mode without configured origins, allow all
  if (allowedOrigins.length === 0) {
    if (nodeEnv === "test" || nodeEnv === "development") {
      return requestOrigin ?? "*";
    }
    // In production without allowed origins, reject all cross-origin requests
    return null;
  }

  // If the request has no Origin header (same-origin request), allow it
  // Note: Empty string is not the same as null - empty string should be rejected
  if (requestOrigin === null) {
    return allowedOrigins[0] ?? null;
  }

  // Check if the request origin is in the allowed list
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Origin not in allowed list - reject
  return null;
}

// CORS configuration
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const validatedOrigin = validateOrigin(requestOrigin ?? null);

  // If origin validation fails, return headers that will block the request
  if (validatedOrigin === null) {
    return {
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
      // Note: Omitting Access-Control-Allow-Origin will cause browsers to block the request
    };
  }

  return {
    "Access-Control-Allow-Origin": validatedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Helper to create JSON response with CORS headers
export function jsonWithCors(
  data: unknown,
  init?: ResponseInit,
  requestOrigin?: string | null
): Response {
  const corsHeaders = getCorsHeaders(requestOrigin);
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// Helper to create Response with CORS headers
export function responseWithCors(
  body: BodyInit | null,
  init?: ResponseInit,
  requestOrigin?: string | null
): Response {
  const corsHeaders = getCorsHeaders(requestOrigin);
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(body, { ...init, headers });
}

// Preflight response for OPTIONS requests
export function preflightResponse(requestOrigin?: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(requestOrigin),
  });
}

// Helper function to create validation error response with CORS
export function createValidationErrorResponse(
  error: ZodError,
  requestOrigin?: string | null
): Response {
  return jsonWithCors(
    {
      error: "Validation failed",
      details: error.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    },
    { status: 400 },
    requestOrigin
  );
}

// Pagination parameters type
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

// Helper function to parse pagination parameters from URL
export function parsePaginationParams(url: URL): PaginationParams {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
