import type { AlertRepository } from "@/db/repositories/alert";
import type { ThresholdRepository } from "@/db/repositories/threshold";
import type { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import { jsonWithCors } from "./utils";

export interface DashboardRouteDeps {
  alertRepo?: AlertRepository | undefined;
  thresholdRepo?: ThresholdRepository | undefined;
  stockSnapshotRepo?: StockSnapshotRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
}

// Mock data for development
const mockDashboardStats = {
  totalProducts: 156,
  activeAlerts: 3,
  lowStockProducts: 12,
  configuredThresholds: 45,
};

export interface DashboardRoutes {
  "/api/dashboard/stats": {
    GET: (req: Request) => Promise<Response>;
  };
}

export function createDashboardRoutes(deps: DashboardRouteDeps): DashboardRoutes {
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
    "/api/dashboard/stats": {
      GET: async (req) => {
        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If repos available and authenticated, use real data
        if (
          authContext &&
          deps.stockSnapshotRepo &&
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
          }, undefined, req);
        }

        // Fallback to mock data
        return jsonWithCors(mockDashboardStats, undefined, req);
      },
    },
  };
}
