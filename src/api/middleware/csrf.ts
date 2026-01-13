import { createCSRFService, type CSRFConfig, type CSRFService } from "@/utils/csrf";
import { jsonWithCors } from "@/server";

export interface CSRFMiddlewareConfig extends CSRFConfig {
  /** HTTP methods that require CSRF validation (default: POST, PUT, DELETE, PATCH) */
  protectedMethods?: string[];
  /** Paths to exclude from CSRF protection */
  excludePaths?: string[];
  /** Custom handler for CSRF validation failures */
  onValidationFailed?: (request: Request) => Response;
}

export interface CSRFMiddleware {
  /** Validate CSRF token, returns error Response if invalid, null if valid */
  validate(request: Request): Response | null;
  /** Generate a new CSRF token */
  generateToken(): string;
  /** Create a Set-Cookie header for the CSRF token */
  createCookie(token: string): string;
  /** Get the CSRF service for advanced operations */
  getService(): CSRFService;
  /** Get the header name clients should use */
  getHeaderName(): string;
  /** Get the cookie name */
  getCookieName(): string;
}

const DEFAULT_PROTECTED_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

/**
 * Creates CSRF protection middleware
 *
 * Usage:
 * 1. On login/session start, generate a token and set the cookie
 * 2. Frontend reads cookie and sends token in X-CSRF-Token header
 * 3. All protected endpoints call middleware.validate()
 */
export function createCSRFMiddleware(config: CSRFMiddlewareConfig): CSRFMiddleware {
  const service = createCSRFService(config);
  const protectedMethods = config.protectedMethods ?? DEFAULT_PROTECTED_METHODS;
  const excludePaths = config.excludePaths ?? [];

  const defaultOnValidationFailed = (): Response => {
    return jsonWithCors(
      { error: "CSRF token validation failed" },
      { status: 403 }
    );
  };

  const onValidationFailed = config.onValidationFailed ?? defaultOnValidationFailed;

  return {
    validate(request: Request): Response | null {
      // Skip validation for non-protected methods
      if (!protectedMethods.includes(request.method)) {
        return null;
      }

      // Skip validation for excluded paths
      const url = new URL(request.url);
      if (excludePaths.some((path) => url.pathname.startsWith(path))) {
        return null;
      }

      // Validate the CSRF token
      if (!service.validateRequest(request)) {
        return onValidationFailed(request);
      }

      return null;
    },

    generateToken(): string {
      return service.generateToken();
    },

    createCookie(token: string): string {
      return service.createCookie(token);
    },

    getService(): CSRFService {
      return service;
    },

    getHeaderName(): string {
      return service.getHeaderName();
    },

    getCookieName(): string {
      return service.getCookieName();
    },
  };
}

/**
 * Higher-order function to wrap a route handler with CSRF protection
 */
export function withCSRFProtection(
  handler: (request: Request) => Response | Promise<Response>,
  config: CSRFMiddlewareConfig
): (request: Request) => Response | Promise<Response> {
  const middleware = createCSRFMiddleware(config);

  return async (request: Request): Promise<Response> => {
    const csrfError = middleware.validate(request);
    if (csrfError) {
      return csrfError;
    }

    return handler(request);
  };
}

/**
 * Adds CSRF cookie to a Response
 */
export function addCSRFCookie(
  response: Response,
  csrfMiddleware: CSRFMiddleware
): Response {
  const token = csrfMiddleware.generateToken();
  const cookie = csrfMiddleware.createCookie(token);

  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Creates a Response with CSRF cookie set (for login/session responses)
 */
export function responseWithCSRF(
  body: BodyInit | null,
  init: ResponseInit | undefined,
  csrfMiddleware: CSRFMiddleware
): Response {
  const token = csrfMiddleware.generateToken();
  const cookie = csrfMiddleware.createCookie(token);

  const headers = new Headers(init?.headers);
  headers.append("Set-Cookie", cookie);

  return new Response(body, {
    ...init,
    headers,
  });
}
