import type { Server } from "bun";
import { z, ZodError } from "zod";
import { loadConfig, type Config } from "@/config";
import type { OAuthHandlerDeps } from "@/api/handlers/oauth";
import { createOAuthRoutes } from "@/api/routes/oauth";
import {
  createBillingRoutes,
  type BillingHandlerDeps,
} from "@/api/handlers/billing";

// CORS configuration
export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": process.env["ALLOWED_ORIGIN"] ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  email: z.string().email("Invalid email format").optional(),
  bsaleConnected: z.boolean().optional(),
  lastSyncAt: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  notificationEmail: z.string().email("Invalid notification email format").optional(),
  syncFrequency: z.enum(["hourly", "daily", "weekly"]).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

// Helper function to create validation error response with CORS
function createValidationErrorResponse(error: ZodError): Response {
  return jsonWithCors(
    {
      error: "Validation failed",
      details: error.errors.map((e) => ({
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

const mockThresholds = [
  { id: "t1", productId: "p1", productName: "Producto A - SKU001", minQuantity: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "t2", productId: "p2", productName: "Producto B - SKU002", minQuantity: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "t3", productId: "p3", productName: "Producto C - SKU003", minQuantity: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const mockSettings = {
  companyName: "Mi Empresa SpA",
  email: "admin@miempresa.cl",
  bsaleConnected: true,
  lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
  emailNotifications: true,
  notificationEmail: "alertas@miempresa.cl",
  syncFrequency: "daily" as const,
};

export function createServer(
  config: Config,
  deps?: ServerDependencies
): Server<undefined> {
  const oauthRoutes = deps?.oauthDeps ? createOAuthRoutes(deps.oauthDeps) : null;
  const billingRoutes = deps?.billingDeps
    ? createBillingRoutes(deps.billingDeps)
    : null;

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
        GET: () => jsonWithCors(mockDashboardStats),
      },

      "/api/alerts": {
        GET: (req) => {
          const url = new URL(req.url);
          const type = url.searchParams.get("type");
          const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);

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
        POST: (req) => {
          const id = req.params.id;
          const alert = mockAlerts.find((a) => a.id === id);
          if (!alert) {
            return jsonWithCors({ error: "Alert not found" }, { status: 404 });
          }
          return jsonWithCors({ success: true });
        },
      },

      "/api/products": {
        GET: () =>
          jsonWithCors({
            products: mockProducts,
            total: mockProducts.length,
          }),
      },

      "/api/products/:id": {
        GET: (req) => {
          const product = mockProducts.find((p) => p.id === req.params.id);
          if (!product) {
            return jsonWithCors({ error: "Product not found" }, { status: 404 });
          }
          return jsonWithCors(product);
        },
      },

      "/api/thresholds": {
        GET: () =>
          jsonWithCors({
            thresholds: mockThresholds,
            total: mockThresholds.length,
          }),
        POST: async (req) => {
          const parseResult = CreateThresholdSchema.safeParse(await req.json());
          if (!parseResult.success) {
            return createValidationErrorResponse(parseResult.error);
          }
          const body = parseResult.data;
          const newThreshold = {
            id: `t${String(Date.now())}`,
            productId: body.productId,
            productName: mockProducts.find((p) => p.id === body.productId)?.name ?? "Unknown",
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
        DELETE: (req) => {
          const id = req.params.id;
          const idx = mockThresholds.findIndex((t) => t.id === id);
          if (idx === -1) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }
          mockThresholds.splice(idx, 1);
          return responseWithCors(null, { status: 204 });
        },
      },

      "/api/settings": {
        GET: () => jsonWithCors(mockSettings),
        PUT: async (req) => {
          const parseResult = UpdateSettingsSchema.safeParse(await req.json());
          if (!parseResult.success) {
            return createValidationErrorResponse(parseResult.error);
          }
          const body = parseResult.data;
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
          const isProduction = process.env["NODE_ENV"] === "production";
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

      // Handle OPTIONS preflight requests for CORS
      if (request.method === "OPTIONS") {
        return preflightResponse();
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
