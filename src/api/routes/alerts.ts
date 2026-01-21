import type { AlertRepository, AlertFilter } from "@/db/repositories/alert";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import { jsonWithCors } from "./utils";

export interface AlertRouteDeps {
  alertRepo?: AlertRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
}

// Mock data for development
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

export interface AlertRoutes {
  "/api/alerts": {
    GET: (req: Request) => Promise<Response>;
  };
  "/api/alerts/:id/dismiss": {
    POST: (req: Bun.BunRequest<"/api/alerts/:id/dismiss">) => Promise<Response>;
  };
}

export function createAlertRoutes(deps: AlertRouteDeps): AlertRoutes {
  // Helper to authenticate request and return context or null (for optional auth)
  async function tryAuthenticate(req: Request): Promise<AuthContext | null> {
    if (!deps.authMiddleware) return null;
    try {
      return await deps.authMiddleware.authenticate(req);
    } catch {
      return null;
    }
  }

  return {
    "/api/alerts": {
      GET: async (req) => {
        const url = new URL(req.url);
        const type = url.searchParams.get("type");
        const status = url.searchParams.get("status");
        const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);

        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If alertRepo available and authenticated, use real data
        if (authContext && deps.alertRepo) {
          const filter: AlertFilter = { limit };

          // Map frontend alert types to database types
          if (type === "threshold_breach") {
            filter.type = "low_stock";
          } else if (type === "low_velocity") {
            filter.type = "low_velocity";
          } else if (type === "out_of_stock") {
            filter.type = "out_of_stock";
          }

          // Add status filter if provided
          if (status === "pending" || status === "sent" || status === "dismissed") {
            filter.status = status;
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
        if (authContext && deps.alertRepo) {
          const alert = await deps.alertRepo.getById(id);
          if (!alert) {
            return jsonWithCors({ error: "Alert not found" }, { status: 404 });
          }
          // Verify user owns this alert
          if (alert.user_id !== authContext.userId) {
            return jsonWithCors({ error: "Alert not found" }, { status: 404 });
          }
          await deps.alertRepo.markAsDismissed(id, authContext.userId);
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
  };
}
