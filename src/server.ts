import type { Server } from "bun";
import { loadConfig, type Config } from "@/config";
import type { OAuthHandlerDeps } from "@/api/handlers/oauth";
import { createOAuthRoutes } from "@/api/routes/oauth";
import {
  createBillingRoutes,
  type BillingHandlerDeps,
} from "@/api/handlers/billing";
import {
  createSyncRoutes,
  type SyncHandlerDeps,
} from "@/api/handlers/sync";
import type { AlertRepository } from "@/db/repositories/alert";
import type { ThresholdRepository } from "@/db/repositories/threshold";
import type { UserRepository } from "@/db/repositories/user";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { SessionRepository } from "@/db/repositories/session";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "@/api/middleware/auth";
import {
  createPathBasedRateLimiter,
  RateLimitPresets,
} from "@/api/middleware/rate-limit";
import {
  createCSRFMiddleware,
  type CSRFMiddleware,
} from "@/api/middleware/csrf";
import {
  captureException,
  traceRequest,
  recordDistribution,
  incrementCounter,
} from "@/monitoring/sentry";
import { logger } from "@/utils/logger";

// Import route modules
import {
  getCorsHeaders,
  jsonWithCors,
  responseWithCors,
  preflightResponse,
} from "@/api/routes/utils";
import { createDashboardRoutes } from "@/api/routes/dashboard";
import { createAlertRoutes } from "@/api/routes/alerts";
import { createProductRoutes } from "@/api/routes/products";
import { createThresholdRoutes, CreateThresholdSchema, UpdateThresholdSchema } from "@/api/routes/thresholds";
import { createSettingsRoutes, UpdateSettingsSchema } from "@/api/routes/settings";
import { createAuthRoutes, LoginSchema } from "@/api/routes/auth";

// Re-export utilities for backward compatibility
export {
  getCorsHeaders,
  jsonWithCors,
  responseWithCors,
  preflightResponse,
};

// Re-export schemas for backward compatibility
export {
  CreateThresholdSchema,
  UpdateThresholdSchema,
  UpdateSettingsSchema,
  LoginSchema,
};

// Type for route handler functions
type RouteHandler = (req: Request) => Response | Promise<Response>;

/**
 * Wraps a route handler with error boundary to catch unhandled errors
 * and report them to Sentry, with request tracing
 */
export function withErrorBoundary(handler: RouteHandler): RouteHandler {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const startTime = Date.now();

    try {
      // Trace the entire request
      const response = await traceRequest(req.method, url.pathname, async () => {
        return await handler(req);
      });

      // Record successful request metrics
      const duration = Date.now() - startTime;
      recordDistribution("http.request.duration", duration, "millisecond", {
        method: req.method,
        route: url.pathname,
        status: String(response.status),
      });
      incrementCounter("http.requests", 1, {
        method: req.method,
        route: url.pathname,
        status: String(response.status),
      });

      return response;
    } catch (error) {
      logger.error(`Unhandled error in ${req.method} ${url.pathname}`, error instanceof Error ? error : new Error(String(error)));

      // Record error metrics
      const duration = Date.now() - startTime;
      recordDistribution("http.request.duration", duration, "millisecond", {
        method: req.method,
        route: url.pathname,
        status: "500",
      });
      incrementCounter("http.requests", 1, {
        method: req.method,
        route: url.pathname,
        status: "500",
      });
      incrementCounter("http.errors", 1, {
        method: req.method,
        route: url.pathname,
      });

      // Capture to Sentry with request context
      captureException(error, {
        tags: {
          route: url.pathname,
          method: req.method,
        },
        extra: {
          url: req.url,
          headers: Object.fromEntries(req.headers.entries()),
        },
      });

      // Return generic error response
      return jsonWithCors(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

// Fallback HTML for when bundled import fails (e.g., in CI tests)
const fallbackHTML = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AISku Alerts - Bsale Inventory Management</title>
    <link rel="stylesheet" href="/frontend/styles/output.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/frontend/main.tsx"></script>
  </body>
</html>`;

// Route handler type for HTML pages - supports both test fallback and Bun HTML imports
type IndexRouteType = (() => Response) | import("bun").HTMLBundle;
let indexRoute: IndexRouteType;

logger.info("Server initialization", { nodeEnv: process.env.NODE_ENV });

if (process.env.NODE_ENV === "test") {
  // In test environment, use simple Response handler
  logger.info("Using fallback HTML for test environment");
  indexRoute = (): Response => new Response(fallbackHTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
} else {
  // In development/production, use bundled HTML for HMR support
  logger.info("Using bundled HTML import");
  indexRoute = (await import("./frontend/index.html")).default;
}

export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface ServerDependencies {
  oauthDeps?: OAuthHandlerDeps;
  billingDeps?: BillingHandlerDeps;
  syncDeps?: SyncHandlerDeps;
  // Repository dependencies for database-backed routes
  alertRepo?: AlertRepository;
  thresholdRepo?: ThresholdRepository;
  userRepo?: UserRepository;
  tenantRepo?: TenantRepository;
  stockSnapshotRepo?: StockSnapshotRepository;
  sessionRepo?: SessionRepository;
}

export function createHealthResponse(): HealthResponse {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}

export function createServer(
  config: Config,
  deps?: ServerDependencies
): Server<undefined> {
  // Create path-based rate limiters for different API endpoints
  const apiRateLimiter = createPathBasedRateLimiter({
    "/api/auth/": RateLimitPresets.auth,
    "/api/billing/": RateLimitPresets.strict,
    "/api/sync/": RateLimitPresets.strict,
    "/api/alerts/": RateLimitPresets.api,
    "/api/thresholds/": RateLimitPresets.api,
    "/api/products/": RateLimitPresets.api,
    "/api/dashboard/": RateLimitPresets.api,
    "/api/settings/": RateLimitPresets.api,
    "/api/webhooks/": RateLimitPresets.webhook,
  });

  // Health check paths that should bypass rate limiting
  const healthPaths = ["/health", "/api/health"];

  const csrfMiddleware: CSRFMiddleware | null = config.csrfTokenSecret
    ? createCSRFMiddleware({
        secret: config.csrfTokenSecret,
        excludePaths: ["/api/webhooks/", "/api/auth/bsale/"],
      })
    : null;

  // Create auth middleware if repos are available
  const authMiddleware: AuthMiddleware | null =
    deps?.sessionRepo && deps.userRepo
      ? createAuthMiddleware(deps.sessionRepo, deps.userRepo)
      : null;

  // Create route handlers from external modules
  const oauthRoutes = deps?.oauthDeps
    ? createOAuthRoutes(deps.oauthDeps, csrfMiddleware ? { csrfMiddleware } : {})
    : null;
  const billingRoutes = deps?.billingDeps
    ? createBillingRoutes(deps.billingDeps)
    : null;
  const syncRoutes = deps?.syncDeps ? createSyncRoutes(deps.syncDeps) : null;

  // Create route modules
  const dashboardRoutes = createDashboardRoutes({
    alertRepo: deps?.alertRepo,
    thresholdRepo: deps?.thresholdRepo,
    stockSnapshotRepo: deps?.stockSnapshotRepo,
    authMiddleware: authMiddleware ?? undefined,
  });

  const alertRoutes = createAlertRoutes({
    alertRepo: deps?.alertRepo,
    authMiddleware: authMiddleware ?? undefined,
  });

  const productRoutes = createProductRoutes({
    thresholdRepo: deps?.thresholdRepo,
    stockSnapshotRepo: deps?.stockSnapshotRepo,
    authMiddleware: authMiddleware ?? undefined,
  });

  const thresholdRoutes = createThresholdRoutes({
    thresholdRepo: deps?.thresholdRepo,
    authMiddleware: authMiddleware ?? undefined,
  });

  const settingsRoutes = createSettingsRoutes({
    userRepo: deps?.userRepo,
    tenantRepo: deps?.tenantRepo,
    authMiddleware: authMiddleware ?? undefined,
  });

  const authRoutesModule = createAuthRoutes();

  return Bun.serve({
    port: config.port,
    routes: {
      // Serve frontend (SPA)
      "/": indexRoute,
      "/login": indexRoute,
      "/app": indexRoute,
      "/app/alerts": indexRoute,
      "/app/products": indexRoute,
      "/app/thresholds": indexRoute,
      "/app/settings": indexRoute,

      // Health check
      "/health": {
        GET: () => jsonWithCors(createHealthResponse()),
      },

      // API Routes
      "/api/health": {
        GET: () => jsonWithCors(createHealthResponse()),
      },

      // Dashboard routes
      "/api/dashboard/stats": dashboardRoutes["/api/dashboard/stats"],

      // Alert routes
      "/api/alerts": alertRoutes["/api/alerts"],
      "/api/alerts/:id/dismiss": alertRoutes["/api/alerts/:id/dismiss"],

      // Product routes
      "/api/products": productRoutes["/api/products"],
      "/api/products/:id": productRoutes["/api/products/:id"],

      // Threshold routes
      "/api/thresholds": thresholdRoutes["/api/thresholds"],
      "/api/thresholds/:id": thresholdRoutes["/api/thresholds/:id"],

      // Settings routes
      "/api/settings": settingsRoutes["/api/settings"],

      // Auth routes
      "/api/auth/login": authRoutesModule["/api/auth/login"],
      "/api/auth/logout": authRoutesModule["/api/auth/logout"],
      "/api/auth/me": authRoutesModule["/api/auth/me"],
    },

    // Fallback handler for OAuth routes, billing routes, and SPA routing
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const startTime = Date.now();

      // Helper to record request metrics
      const recordRequestMetrics = (status: number): void => {
        const duration = Date.now() - startTime;
        recordDistribution("http.request.duration", duration, "millisecond", {
          method: request.method,
          route: url.pathname,
          status: String(status),
        });
        incrementCounter("http.requests", 1, {
          method: request.method,
          route: url.pathname,
          status: String(status),
        });
      };

      try {
        // Handle OPTIONS preflight requests for CORS
        if (request.method === "OPTIONS") {
          recordRequestMetrics(204);
          return preflightResponse();
        }

        // Apply CSRF protection to state-changing requests (POST, PUT, DELETE, PATCH)
        if (csrfMiddleware && url.pathname.startsWith("/api/")) {
          const csrfError = csrfMiddleware.validate(request);
          if (csrfError) {
            recordRequestMetrics(csrfError.status);
            return csrfError;
          }
        }

        // Apply rate limiting to API endpoints (bypass health checks)
        if (url.pathname.startsWith("/api/") && !healthPaths.includes(url.pathname)) {
          const rateLimitResponse = apiRateLimiter.check(request);
          if (rateLimitResponse) {
            return rateLimitResponse;
          }
        }

        // OAuth routes (if configured)
        if (oauthRoutes) {
          if (url.pathname === "/api/auth/bsale/start" && request.method === "GET") {
            const response = await traceRequest("GET", "/api/auth/bsale/start", () => {
              return Promise.resolve(oauthRoutes.start(request));
            });
            recordRequestMetrics(response.status);
            return response;
          }

          if (url.pathname === "/api/auth/bsale/callback" && request.method === "GET") {
            const response = await traceRequest("GET", "/api/auth/bsale/callback", async () => {
              return await oauthRoutes.callback(request);
            });
            recordRequestMetrics(response.status);
            return response;
          }

          if (url.pathname === "/api/auth/logout" && request.method === "POST") {
            const response = await traceRequest("POST", "/api/auth/logout", async () => {
              return await oauthRoutes.logout(request);
            });
            recordRequestMetrics(response.status);
            return response;
          }
        }

        // Billing routes (if configured)
        if (billingRoutes) {
          if (url.pathname === "/api/billing/checkout" && request.method === "POST") {
            const response = await traceRequest("POST", "/api/billing/checkout", async () => {
              return await billingRoutes.checkout(request);
            });
            recordRequestMetrics(response.status);
            return response;
          }

          if (url.pathname === "/api/billing/portal" && request.method === "POST") {
            const response = await traceRequest("POST", "/api/billing/portal", async () => {
              return await billingRoutes.portal(request);
            });
            recordRequestMetrics(response.status);
            return response;
          }

          if (url.pathname === "/api/webhooks/stripe" && request.method === "POST") {
            const response = await traceRequest("POST", "/api/webhooks/stripe", async () => {
              return await billingRoutes.webhook(request);
            });
            recordRequestMetrics(response.status);
            return response;
          }
        }

        // Sync routes (if configured)
        if (syncRoutes) {
          if (url.pathname === "/api/sync/trigger" && request.method === "POST") {
            const response = await traceRequest("POST", "/api/sync/trigger", async () => {
              return await syncRoutes.trigger(request);
            });
            recordRequestMetrics(response.status);
            return response;
          }
        }

        // API routes that don't match should return 404
        if (url.pathname.startsWith("/api/")) {
          recordRequestMetrics(404);
          return jsonWithCors({ error: "Not Found" }, { status: 404 });
        }

        // All other routes not defined in the routes object should return 404
        recordRequestMetrics(404);
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>404 - Page Not Found</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #f8fafc;
      color: #1e293b;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 4rem;
      margin: 0;
      color: #0ea5e9;
    }
    p {
      font-size: 1.25rem;
      margin: 1rem 0;
      color: #64748b;
    }
    a {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: #0ea5e9;
      color: white;
      text-decoration: none;
      border-radius: 0.5rem;
      transition: background 0.2s;
    }
    a:hover {
      background: #0284c7;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>La página que buscas no existe</p>
    <a href="/">Volver al inicio</a>
  </div>
</body>
</html>`,
          {
            status: 404,
            headers: { "Content-Type": "text/html" },
          }
        );
      } catch (error) {
        logger.error(`Unhandled error in ${request.method} ${url.pathname}`, error instanceof Error ? error : new Error(String(error)));

        // Record error metrics
        recordRequestMetrics(500);
        incrementCounter("http.errors", 1, {
          method: request.method,
          route: url.pathname,
        });

        // Capture to Sentry with request context
        captureException(error, {
          tags: {
            route: url.pathname,
            method: request.method,
            handler: "fetch",
          },
          extra: {
            url: request.url,
          },
        });

        // Return generic error response
        return jsonWithCors(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    },

    development:
      config.nodeEnv !== "production"
        ? {
            hmr: true,
            console: true,
          }
        : false,
  });
}

export function startServer(
  config?: Config,
  deps?: ServerDependencies
): Server<undefined> {
  const resolvedConfig = config ?? loadConfig();
  const server = createServer(resolvedConfig, deps);
  logger.info("Server started", { port: resolvedConfig.port });
  return server;
}

// Only run when executed directly (not imported)
if (import.meta.main) {
  startServer();
}
