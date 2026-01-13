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
  createRateLimitMiddleware,
  RateLimitPresets,
} from "@/api/middleware/rate-limit";
import {
  createCSRFMiddleware,
  type CSRFMiddleware,
} from "@/api/middleware/csrf";
import { captureException } from "@/monitoring/sentry";

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
 * and report them to Sentry
 */
export function withErrorBoundary(handler: RouteHandler): RouteHandler {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      const url = new URL(req.url);
      console.error(`[ErrorBoundary] Unhandled error in ${req.method} ${url.pathname}:`, error);

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

console.info("[server.ts] NODE_ENV:", process.env.NODE_ENV);

if (process.env.NODE_ENV === "test") {
  // In test environment, use simple Response handler
  console.info("[server.ts] Using fallback HTML for test environment");
  indexRoute = (): Response => new Response(fallbackHTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
} else {
  // In development/production, use bundled HTML for HMR support
  console.info("[server.ts] Using bundled HTML import");
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
  // Create security middleware
  const authRateLimiter = createRateLimitMiddleware(RateLimitPresets.auth);

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

      try {
        // Handle OPTIONS preflight requests for CORS
        if (request.method === "OPTIONS") {
          return preflightResponse();
        }

        // Apply CSRF protection to state-changing requests (POST, PUT, DELETE, PATCH)
        if (csrfMiddleware && url.pathname.startsWith("/api/")) {
          const csrfError = csrfMiddleware.validate(request);
          if (csrfError) {
            return csrfError;
          }
        }

        // OAuth routes (if configured)
        if (oauthRoutes) {
          // Apply rate limiting to auth endpoints
          if (url.pathname.startsWith("/api/auth/bsale/")) {
            const rateLimitResponse = authRateLimiter.check(request);
            if (rateLimitResponse) {
              return rateLimitResponse;
            }
          }

          if (url.pathname === "/api/auth/bsale/start" && request.method === "GET") {
            return oauthRoutes.start(request);
          }

          if (url.pathname === "/api/auth/bsale/callback" && request.method === "GET") {
            return await oauthRoutes.callback(request);
          }

          if (url.pathname === "/api/auth/logout" && request.method === "POST") {
            return await oauthRoutes.logout(request);
          }
        }

        // Billing routes (if configured)
        if (billingRoutes) {
          if (url.pathname === "/api/billing/checkout" && request.method === "POST") {
            return await billingRoutes.checkout(request);
          }

          if (url.pathname === "/api/billing/portal" && request.method === "POST") {
            return await billingRoutes.portal(request);
          }

          if (url.pathname === "/api/webhooks/stripe" && request.method === "POST") {
            return await billingRoutes.webhook(request);
          }
        }

        // Sync routes (if configured)
        if (syncRoutes) {
          if (url.pathname === "/api/sync/trigger" && request.method === "POST") {
            return await syncRoutes.trigger(request);
          }
        }

        // API routes that don't match should return 404
        if (url.pathname.startsWith("/api/")) {
          return jsonWithCors({ error: "Not Found" }, { status: 404 });
        }

        // All other routes not defined in the routes object should return 404
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
        console.error(`[FetchHandler] Unhandled error in ${request.method} ${url.pathname}:`, error);

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
  console.info(`Server started on port ${String(resolvedConfig.port)}`);
  return server;
}

// Only run when executed directly (not imported)
if (import.meta.main) {
  startServer();
}
