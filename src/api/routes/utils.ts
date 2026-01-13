import { ZodError } from "zod";

// CORS configuration
export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": process.env["ALLOWED_ORIGIN"] ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Helper to create JSON response with CORS headers
export function jsonWithCors(data: unknown, init?: ResponseInit): Response {
  const corsHeaders = getCorsHeaders();
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// Helper to create Response with CORS headers
export function responseWithCors(body: BodyInit | null, init?: ResponseInit): Response {
  const corsHeaders = getCorsHeaders();
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(body, { ...init, headers });
}

// Preflight response for OPTIONS requests
export function preflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

// Helper function to create validation error response with CORS
export function createValidationErrorResponse(error: ZodError): Response {
  return jsonWithCors(
    {
      error: "Validation failed",
      details: error.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    },
    { status: 400 }
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
