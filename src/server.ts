import type { Server } from "bun";
import { loadConfig, type Config } from "@/config";
import type { OAuthHandlerDeps } from "@/api/handlers/oauth";
import { createOAuthRoutes } from "@/api/routes/oauth";
import {
  createBillingRoutes,
  type BillingHandlerDeps,
} from "@/api/handlers/billing";
import index from "./frontend/index.html";

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
      "/": index,
      "/login": index,
      "/app": index,
      "/app/alerts": index,
      "/app/products": index,
      "/app/thresholds": index,
      "/app/settings": index,

      // Health check
      "/health": {
        GET: () => Response.json(createHealthResponse()),
      },

      // API Routes
      "/api/health": {
        GET: () => Response.json(createHealthResponse()),
      },

      "/api/dashboard/stats": {
        GET: () => Response.json(mockDashboardStats),
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

          return Response.json({
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
            return Response.json({ error: "Alert not found" }, { status: 404 });
          }
          return Response.json({ success: true });
        },
      },

      "/api/products": {
        GET: () =>
          Response.json({
            products: mockProducts,
            total: mockProducts.length,
          }),
      },

      "/api/products/:id": {
        GET: (req) => {
          const product = mockProducts.find((p) => p.id === req.params.id);
          if (!product) {
            return Response.json({ error: "Product not found" }, { status: 404 });
          }
          return Response.json(product);
        },
      },

      "/api/thresholds": {
        GET: () =>
          Response.json({
            thresholds: mockThresholds,
            total: mockThresholds.length,
          }),
        POST: async (req) => {
          const body = await req.json() as { productId: string; minQuantity: number };
          const newThreshold = {
            id: `t${String(Date.now())}`,
            productId: body.productId,
            productName: mockProducts.find((p) => p.id === body.productId)?.name ?? "Unknown",
            minQuantity: body.minQuantity,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          mockThresholds.push(newThreshold);
          return Response.json(newThreshold, { status: 201 });
        },
      },

      "/api/thresholds/:id": {
        PUT: async (req) => {
          const id = req.params.id;
          const body = await req.json() as { minQuantity: number };
          const idx = mockThresholds.findIndex((t) => t.id === id);
          if (idx === -1) {
            return Response.json({ error: "Threshold not found" }, { status: 404 });
          }
          const existing = mockThresholds[idx];
          if (existing) {
            mockThresholds[idx] = {
              ...existing,
              minQuantity: body.minQuantity,
              updatedAt: new Date().toISOString(),
            };
          }
          return Response.json(mockThresholds[idx]);
        },
        DELETE: (req) => {
          const id = req.params.id;
          const idx = mockThresholds.findIndex((t) => t.id === id);
          if (idx === -1) {
            return Response.json({ error: "Threshold not found" }, { status: 404 });
          }
          mockThresholds.splice(idx, 1);
          return new Response(null, { status: 204 });
        },
      },

      "/api/settings": {
        GET: () => Response.json(mockSettings),
        PUT: async (req) => {
          const body = await req.json() as Partial<typeof mockSettings>;
          Object.assign(mockSettings, body);
          return Response.json(mockSettings);
        },
      },

      "/api/auth/login": {
        POST: async (req) => {
          const body = await req.json() as { email?: string; password?: string };
          // Mock login - always succeeds for demo
          if (body.email && body.password) {
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

            return Response.json(
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
          }
          return Response.json({ error: "Invalid credentials" }, { status: 401 });
        },
      },

      "/api/auth/logout": {
        POST: () =>
          new Response(JSON.stringify({ success: true }), {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": "session_token=; HttpOnly; Path=/; Max-Age=0",
            },
          }),
      },

      "/api/auth/me": {
        GET: (req) => {
          const cookie = req.headers.get("Cookie") ?? "";
          if (!cookie.includes("session_token=")) {
            return Response.json({ user: null }, { status: 401 });
          }
          return Response.json({
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
        return Response.json({ error: "Not Found" }, { status: 404 });
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
