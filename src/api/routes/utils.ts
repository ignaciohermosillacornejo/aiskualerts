import { ZodError } from "zod";

// CORS configuration
// Parse allowed origins from environment (comma-separated list)
function getAllowedOrigins(): string[] {
  const origins = process.env["ALLOWED_ORIGINS"] ?? process.env["ALLOWED_ORIGIN"] ?? "";
  if (!origins) {
    return [];
  }
  return origins.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
}

// Validate request origin against allowed origins
export function validateOrigin(request: Request | null): string | null {
  const allowedOrigins = getAllowedOrigins();

  // If no origins configured, reject in production
  if (allowedOrigins.length === 0) {
    // eslint-disable-next-line @typescript-eslint/dot-notation -- env var access requires bracket notation
    if (process.env["NODE_ENV"] === "production") {
      // Return null to indicate origin should be rejected
      return null;
    }
    // In non-production, allow all origins for development convenience
    return "*";
  }

  // Get the request origin
  const requestOrigin = request?.headers.get("Origin");

  // If request has no origin header (same-origin request or non-browser client),
  // use the first allowed origin
  if (!requestOrigin) {
    return allowedOrigins[0] ?? null;
  }

  // Check if request origin is in allowed list
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Origin not allowed - return null to indicate rejection
  return null;
}

export function getCorsHeaders(request?: Request | null): Record<string, string> {
  const origin = validateOrigin(request ?? null);

  // If origin is null, still return headers but with empty origin
  // The caller should handle rejecting the request
  return {
    "Access-Control-Allow-Origin": origin ?? "",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
    // Add Vary header to ensure proper caching with dynamic origins
    ...(origin && origin !== "*" ? { "Vary": "Origin" } : {}),
  };
}

// Helper to create JSON response with CORS headers
export function jsonWithCors(data: unknown, init?: ResponseInit, request?: Request | null): Response {
  const corsHeaders = getCorsHeaders(request);
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// Helper to create Response with CORS headers
export function responseWithCors(body: BodyInit | null, init?: ResponseInit, request?: Request | null): Response {
  const corsHeaders = getCorsHeaders(request);
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(body, { ...init, headers });
}

// Preflight response for OPTIONS requests
export function preflightResponse(request?: Request | null): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

// Helper to check if a cross-origin request should be rejected
export function shouldRejectCorsRequest(request: Request): boolean {
  const origin = validateOrigin(request);
  // Reject if origin is null (means origin validation failed)
  // and the request has an Origin header (meaning it's a cross-origin request)
  return origin === null && request.headers.get("Origin") !== null;
}

// Create a CORS rejection response
export function corsRejectionResponse(): Response {
  return new Response(JSON.stringify({ error: "Origin not allowed" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

// Helper function to create validation error response with CORS
export function createValidationErrorResponse(error: ZodError, request?: Request | null): Response {
  return jsonWithCors(
    {
      error: "Validation failed",
      details: error.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    },
    { status: 400 },
    request
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
