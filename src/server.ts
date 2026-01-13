import type { Server } from "bun";
import { z, ZodError } from "zod";
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
import type { AlertRepository, AlertFilter } from "@/db/repositories/alert";
import type { ThresholdRepository } from "@/db/repositories/threshold";
import type { UserRepository } from "@/db/repositories/user";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { SessionRepository } from "@/db/repositories/session";
import {
  createAuthMiddleware,
  type AuthMiddleware,
  type AuthContext,
} from "@/api/middleware/auth";
import {
  createPathBasedRateLimiter,
  RateLimitPresets,
} from "@/api/middleware/rate-limit";
import {
  createCSRFMiddleware,
  type CSRFMiddleware,
} from "@/api/middleware/csrf";
import { captureException } from "@/monitoring/sentry";

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

// Zod schemas for API request validation
export const CreateThresholdSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  minQuantity: z.number().int().nonnegative("minQuantity must be a non-negative integer"),
});

export const UpdateThresholdSchema = z.object({
  minQuantity: z.number().int().nonnegative("minQuantity must be a non-negative integer"),
});

export const UpdateSettingsSchema = z.object({
  companyName: z.string().optional(),
  email: z.email("Invalid email format").optional(),
  bsaleConnected: z.boolean().optional(),
  lastSyncAt: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  notificationEmail: z.email("Invalid notification email format").optional(),
  syncFrequency: z.enum(["hourly", "daily", "weekly"]).optional(),
  digestFrequency: z.enum(["daily", "weekly", "none"]).optional(),
});

export const LoginSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

// Helper function to create validation error response with CORS
function createValidationErrorResponse(error: ZodError): Response {
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

// Mock data for development - will be replaced with real database queries
const mockDashboardStats = {
  totalProducts: 156,
  activeAlerts: 3,
  lowStockProducts: 12,
  configuredThresholds: 45,
};

const mockAlerts = [
  {
    id: "1",
    type: "threshold_breach" as const,
    productId: "p1",
    productName: "Producto A - SKU001",
    message: "Stock bajo el umbral minimo (5 < 10)",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    dismissedAt: null,
  },
  {
    id: "2",
    type: "low_velocity" as const,
    productId: "p2",
    productName: "Producto B - SKU002",
    message: "Velocidad de venta muy baja en ultimos 30 dias",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    dismissedAt: null,
  },
  {
    id: "3",
    type: "threshold_breach" as const,
    productId: "p3",
    productName: "Producto C - SKU003",
    message: "Stock agotado (0 < 5)",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    dismissedAt: null,
  },
];

const mockProducts = [
  { id: "p1", bsaleId: 1001, sku: "SKU001", name: "Producto A", currentStock: 5, threshold: 10, lastSyncAt: new Date().toISOString() },
  { id: "p2", bsaleId: 1002, sku: "SKU002", name: "Producto B", currentStock: 150, threshold: 20, lastSyncAt: new Date().toISOString() },
  { id: "p3", bsaleId: 1003, sku: "SKU003", name: "Producto C", currentStock: 0, threshold: 5, lastSyncAt: new Date().toISOString() },
  { id: "p4", bsaleId: 1004, sku: "SKU004", name: "Producto D", currentStock: 75, threshold: 15, lastSyncAt: new Date().toISOString() },
  { id: "p5", bsaleId: 1005, sku: "SKU005", name: "Producto E", currentStock: 200, threshold: null, lastSyncAt: new Date().toISOString() },
];

const mockSettings = {
  companyName: "Mi Empresa SpA",
  email: "admin@miempresa.cl",
  bsaleConnected: true,
  lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
  emailNotifications: true,
  notificationEmail: "alertas@miempresa.cl",
  syncFrequency: "daily" as const,
  digestFrequency: "daily" as const,
  isPaid: false,
  stripeCustomerId: null as string | null,
};

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

  const oauthRoutes = deps?.oauthDeps
    ? createOAuthRoutes(deps.oauthDeps, csrfMiddleware ? { csrfMiddleware } : {})
    : null;
  const billingRoutes = deps?.billingDeps
    ? createBillingRoutes(deps.billingDeps)
    : null;
  const syncRoutes = deps?.syncDeps ? createSyncRoutes(deps.syncDeps) : null;

  // Per-instance mock data to avoid test isolation issues
  const mockThresholds = [
    { id: "t1", productId: "p1", productName: "Producto A - SKU001", minQuantity: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "t2", productId: "p2", productName: "Producto B - SKU002", minQuantity: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "t3", productId: "p3", productName: "Producto C - SKU003", minQuantity: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  // Create auth middleware if repos are available
  const authMiddleware: AuthMiddleware | null =
    deps?.sessionRepo && deps.userRepo
      ? createAuthMiddleware(deps.sessionRepo, deps.userRepo)
      : null;

  // Helper to authenticate request and return context or null (for optional auth)
  async function tryAuthenticate(req: Request): Promise<AuthContext | null> {
    if (!authMiddleware) return null;
    try {
      return await authMiddleware.authenticate(req);
    } catch {
      return null;
    }
  }

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

      "/api/dashboard/stats": {
        GET: async (req) => {
          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If repos available and authenticated, use real data
          if (
            authContext &&
            deps?.stockSnapshotRepo &&
            deps.alertRepo &&
            deps.thresholdRepo
          ) {
            const [totalProducts, activeAlerts, configuredThresholds] =
              await Promise.all([
                deps.stockSnapshotRepo.countDistinctProductsByTenant(
                  authContext.tenantId
                ),
                deps.alertRepo.countPendingByUser(authContext.userId),
                deps.thresholdRepo.countByUser(authContext.userId),
              ]);

            // Low stock count uses a default threshold of 10
            const lowStockProducts =
              await deps.stockSnapshotRepo.countLowStockByTenant(
                authContext.tenantId,
                10
              );

            return jsonWithCors({
              totalProducts,
              activeAlerts,
              lowStockProducts,
              configuredThresholds,
            });
          }

          // Fallback to mock data
          return jsonWithCors(mockDashboardStats);
        },
      },

      "/api/alerts": {
        GET: async (req) => {
          const url = new URL(req.url);
          const type = url.searchParams.get("type");
          const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);

          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If alertRepo available and authenticated, use real data
          if (authContext && deps?.alertRepo) {
            const filter: AlertFilter = { limit };

            // Map frontend alert types to database types
            if (type === "threshold_breach") {
              filter.type = "low_stock";
            } else if (type === "low_velocity") {
              filter.type = "low_velocity";
            } else if (type === "out_of_stock") {
              filter.type = "out_of_stock";
            }

            const result = await deps.alertRepo.findByUserWithFilter(
              authContext.userId,
              filter
            );

            // Transform DB alerts to API format
            const alerts = result.alerts.map((alert) => ({
              id: alert.id,
              type:
                alert.alert_type === "low_stock"
                  ? ("threshold_breach" as const)
                  : alert.alert_type,
              productId: String(alert.bsale_variant_id),
              productName: alert.product_name ?? `SKU ${alert.sku ?? "Unknown"}`,
              message:
                alert.alert_type === "low_stock"
                  ? `Stock bajo el umbral minimo (${String(alert.current_quantity)} < ${String(alert.threshold_quantity ?? 0)})`
                  : alert.alert_type === "out_of_stock"
                    ? `Stock agotado (${String(alert.current_quantity)})`
                    : `Velocidad de venta muy baja en ultimos 30 dias`,
              createdAt: alert.created_at.toISOString(),
              dismissedAt:
                alert.status === "dismissed" ? alert.sent_at?.toISOString() ?? null : null,
            }));

            return jsonWithCors({
              alerts,
              total: result.total,
            });
          }

          // Fallback to mock data
          let filtered = mockAlerts;
          if (type) {
            filtered = filtered.filter((a) => a.type === type);
          }

          return jsonWithCors({
            alerts: filtered.slice(0, limit),
            total: filtered.length,
          });
        },
      },

      "/api/alerts/:id/dismiss": {
        POST: async (req) => {
          const id = req.params.id;

          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If alertRepo available and authenticated, use real data
          if (authContext && deps?.alertRepo) {
            const alert = await deps.alertRepo.getById(id);
            if (!alert) {
              return jsonWithCors({ error: "Alert not found" }, { status: 404 });
            }
            // Verify user owns this alert
            if (alert.user_id !== authContext.userId) {
              return jsonWithCors({ error: "Alert not found" }, { status: 404 });
            }
            await deps.alertRepo.markAsDismissed(id);
            return jsonWithCors({ success: true });
          }

          // Fallback to mock data
          const alert = mockAlerts.find((a) => a.id === id);
          if (!alert) {
            return jsonWithCors({ error: "Alert not found" }, { status: 404 });
          }
          return jsonWithCors({ success: true });
        },
      },

      "/api/products": {
        GET: async (req) => {
          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If stockSnapshotRepo available and authenticated, use real data
          if (authContext && deps?.stockSnapshotRepo && deps.thresholdRepo) {
            const [snapshots, thresholds] = await Promise.all([
              deps.stockSnapshotRepo.getLatestByTenant(authContext.tenantId),
              deps.thresholdRepo.getByUser(authContext.userId),
            ]);

            // Create a map of variant thresholds for quick lookup
            const thresholdMap = new Map<number, number>();
            for (const t of thresholds) {
              if (t.bsale_variant_id !== null) {
                thresholdMap.set(t.bsale_variant_id, t.min_quantity);
              }
            }

            // Transform snapshots to products
            const products = snapshots.map((s) => ({
              id: s.id,
              bsaleId: s.bsale_variant_id,
              sku: s.sku ?? "",
              name: s.product_name ?? `Product ${String(s.bsale_variant_id)}`,
              currentStock: s.quantity_available,
              threshold: thresholdMap.get(s.bsale_variant_id) ?? null,
              lastSyncAt: s.created_at.toISOString(),
            }));

            return jsonWithCors({
              products,
              total: products.length,
            });
          }

          // Fallback to mock data
          return jsonWithCors({
            products: mockProducts,
            total: mockProducts.length,
          });
        },
      },

      "/api/products/:id": {
        GET: async (req) => {
          const productId = req.params.id;

          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // For DB lookup, we'd need to add a getById method to stockSnapshotRepo
          // For now, fallback to mock if not a valid mock ID
          if (authContext && deps?.stockSnapshotRepo) {
            // Note: This would need a getById method on stockSnapshotRepo
            // For now, check mock data first for backwards compatibility
          }

          // Fallback to mock data
          const product = mockProducts.find((p) => p.id === productId);
          if (!product) {
            return jsonWithCors({ error: "Product not found" }, { status: 404 });
          }
          return jsonWithCors(product);
        },
      },

      "/api/thresholds": {
        GET: async (req) => {
          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If thresholdRepo available and authenticated, use real data
          if (authContext && deps?.thresholdRepo) {
            const thresholds = await deps.thresholdRepo.getByUser(
              authContext.userId
            );

            // Transform DB thresholds to API format
            const apiThresholds = thresholds.map((t) => ({
              id: t.id,
              productId: t.bsale_variant_id ? String(t.bsale_variant_id) : null,
              productName: t.bsale_variant_id
                ? `Product ${String(t.bsale_variant_id)}`
                : "Default Threshold",
              minQuantity: t.min_quantity,
              createdAt: t.created_at.toISOString(),
              updatedAt: t.updated_at.toISOString(),
            }));

            return jsonWithCors({
              thresholds: apiThresholds,
              total: apiThresholds.length,
            });
          }

          // Fallback to mock data
          return jsonWithCors({
            thresholds: mockThresholds,
            total: mockThresholds.length,
          });
        },
        POST: async (req) => {
          const parseResult = CreateThresholdSchema.safeParse(await req.json());
          if (!parseResult.success) {
            return createValidationErrorResponse(parseResult.error);
          }
          const body = parseResult.data;

          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If thresholdRepo available and authenticated, use real data
          if (authContext && deps?.thresholdRepo) {
            const threshold = await deps.thresholdRepo.create({
              tenant_id: authContext.tenantId,
              user_id: authContext.userId,
              bsale_variant_id: parseInt(body.productId, 10) || null,
              min_quantity: body.minQuantity,
            });

            return jsonWithCors(
              {
                id: threshold.id,
                productId: threshold.bsale_variant_id
                  ? String(threshold.bsale_variant_id)
                  : null,
                productName: threshold.bsale_variant_id
                  ? `Product ${String(threshold.bsale_variant_id)}`
                  : "Default Threshold",
                minQuantity: threshold.min_quantity,
                createdAt: threshold.created_at.toISOString(),
                updatedAt: threshold.updated_at.toISOString(),
              },
              { status: 201 }
            );
          }

          // Fallback to mock data
          const newThreshold = {
            id: `t${String(Date.now())}`,
            productId: body.productId,
            productName:
              mockProducts.find((p) => p.id === body.productId)?.name ?? "Unknown",
            minQuantity: body.minQuantity,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          mockThresholds.push(newThreshold);
          return jsonWithCors(newThreshold, { status: 201 });
        },
      },

      "/api/thresholds/:id": {
        PUT: async (req) => {
          const id = req.params.id;
          const parseResult = UpdateThresholdSchema.safeParse(await req.json());
          if (!parseResult.success) {
            return createValidationErrorResponse(parseResult.error);
          }
          const body = parseResult.data;

          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If thresholdRepo available and authenticated, use real data
          if (authContext && deps?.thresholdRepo) {
            const existingThreshold = await deps.thresholdRepo.getById(id);
            if (!existingThreshold) {
              return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
            }
            // Verify user owns this threshold
            if (existingThreshold.user_id !== authContext.userId) {
              return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
            }

            const updated = await deps.thresholdRepo.update(id, {
              min_quantity: body.minQuantity,
            });

            return jsonWithCors({
              id: updated.id,
              productId: updated.bsale_variant_id
                ? String(updated.bsale_variant_id)
                : null,
              productName: updated.bsale_variant_id
                ? `Product ${String(updated.bsale_variant_id)}`
                : "Default Threshold",
              minQuantity: updated.min_quantity,
              createdAt: updated.created_at.toISOString(),
              updatedAt: updated.updated_at.toISOString(),
            });
          }

          // Fallback to mock data
          const idx = mockThresholds.findIndex((t) => t.id === id);
          if (idx === -1) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }
          // eslint-disable-next-line security/detect-object-injection -- idx is validated numeric index from findIndex, -1 case handled above
          const existing = mockThresholds[idx];
          if (existing) {
            // eslint-disable-next-line security/detect-object-injection -- idx is validated numeric index from findIndex, -1 case handled above
            mockThresholds[idx] = {
              ...existing,
              minQuantity: body.minQuantity,
              updatedAt: new Date().toISOString(),
            };
          }
          // eslint-disable-next-line security/detect-object-injection -- idx is validated numeric index from findIndex, -1 case handled above
          return jsonWithCors(mockThresholds[idx]);
        },
        DELETE: async (req) => {
          const id = req.params.id;

          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If thresholdRepo available and authenticated, use real data
          if (authContext && deps?.thresholdRepo) {
            const existingThreshold = await deps.thresholdRepo.getById(id);
            if (!existingThreshold) {
              return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
            }
            // Verify user owns this threshold
            if (existingThreshold.user_id !== authContext.userId) {
              return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
            }

            const deleted = await deps.thresholdRepo.delete(id);
            if (!deleted) {
              return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
            }
            return responseWithCors(null, { status: 204 });
          }

          // Fallback to mock data
          const idx = mockThresholds.findIndex((t) => t.id === id);
          if (idx === -1) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }
          mockThresholds.splice(idx, 1);
          return responseWithCors(null, { status: 204 });
        },
      },

      "/api/settings": {
        GET: async (req) => {
          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If userRepo and tenantRepo available and authenticated, use real data
          if (authContext && deps?.userRepo && deps.tenantRepo) {
            const [user, tenant] = await Promise.all([
              deps.userRepo.getById(authContext.userId),
              deps.tenantRepo.getById(authContext.tenantId),
            ]);

            if (!user || !tenant) {
              return jsonWithCors(mockSettings);
            }

            return jsonWithCors({
              companyName: tenant.bsale_client_name,
              email: user.email,
              bsaleConnected: tenant.sync_status === "success",
              lastSyncAt: tenant.last_sync_at?.toISOString() ?? null,
              emailNotifications: user.notification_enabled,
              notificationEmail: user.notification_email,
              syncFrequency: "daily" as const, // Default, could be stored in a settings table
              digestFrequency: user.digest_frequency,
              isPaid: tenant.is_paid,
              stripeCustomerId: tenant.stripe_customer_id,
            });
          }

          // Fallback to mock data
          return jsonWithCors(mockSettings);
        },
        PUT: async (req) => {
          const parseResult = UpdateSettingsSchema.safeParse(await req.json());
          if (!parseResult.success) {
            return createValidationErrorResponse(parseResult.error);
          }
          const body = parseResult.data;

          // Try to get authenticated user context
          const authContext = await tryAuthenticate(req);

          // If userRepo available and authenticated, use real data
          if (authContext && deps?.userRepo && deps.tenantRepo) {
            // Update user settings
            const updateInput: Partial<{
              name: string | null;
              notification_enabled: boolean;
              notification_email: string | null;
              digest_frequency: "daily" | "weekly" | "none";
            }> = {};

            if (body.emailNotifications !== undefined) {
              updateInput.notification_enabled = body.emailNotifications;
            }
            if (body.notificationEmail !== undefined) {
              updateInput.notification_email = body.notificationEmail ?? null;
            }
            if (body.digestFrequency !== undefined) {
              updateInput.digest_frequency = body.digestFrequency;
            }

            const updatedUser = await deps.userRepo.update(
              authContext.userId,
              updateInput
            );

            // Get tenant for complete response
            const tenant = await deps.tenantRepo.getById(authContext.tenantId);

            return jsonWithCors({
              companyName: body.companyName ?? tenant?.bsale_client_name ?? "",
              email: body.email ?? updatedUser.email,
              bsaleConnected: tenant?.sync_status === "success",
              lastSyncAt: tenant?.last_sync_at?.toISOString() ?? null,
              emailNotifications: updatedUser.notification_enabled,
              notificationEmail: updatedUser.notification_email,
              syncFrequency: body.syncFrequency ?? "daily",
              digestFrequency: updatedUser.digest_frequency,
              isPaid: tenant?.is_paid ?? false,
              stripeCustomerId: tenant?.stripe_customer_id ?? null,
            });
          }

          // Fallback to mock data
          Object.assign(mockSettings, body);
          return jsonWithCors(mockSettings);
        },
      },

      "/api/auth/login": {
        POST: async (req) => {
          const parseResult = LoginSchema.safeParse(await req.json());
          if (!parseResult.success) {
            return createValidationErrorResponse(parseResult.error);
          }
          const body = parseResult.data;
          // Mock login - always succeeds for demo
          const isProduction = process.env.NODE_ENV === "production";
          const maxAge = 30 * 24 * 60 * 60; // 30 days
          const sessionToken = `mock_${String(Date.now())}_${Math.random().toString(36)}`;

          const cookieParts = [
            `session_token=${sessionToken}`,
            "HttpOnly",
            "Path=/",
            `Max-Age=${String(maxAge)}`,
          ];

          if (isProduction) {
            cookieParts.push("Secure", "SameSite=Strict");
          }

          return jsonWithCors(
            {
              user: {
                id: "u1",
                email: body.email,
                name: "Usuario Demo",
                role: "admin" as const,
              },
            },
            {
              headers: {
                "Set-Cookie": cookieParts.join("; "),
              },
            }
          );
        },
      },

      "/api/auth/logout": {
        POST: () =>
          jsonWithCors(
            { success: true },
            {
              headers: {
                "Set-Cookie": "session_token=; HttpOnly; Path=/; Max-Age=0",
              },
            }
          ),
      },

      "/api/auth/me": {
        GET: (req) => {
          const cookie = req.headers.get("Cookie") ?? "";
          if (!cookie.includes("session_token=")) {
            return jsonWithCors({ user: null }, { status: 401 });
          }
          return jsonWithCors({
            user: {
              id: "u1",
              email: "demo@empresa.cl",
              name: "Usuario Demo",
              role: "admin" as const,
            },
          });
        },
      },
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
