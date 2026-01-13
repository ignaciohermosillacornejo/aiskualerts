import type { TenantRepository } from "@/db/repositories/tenant";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import { runSyncAndAlerts, type SyncJobResult } from "@/jobs/sync-job";

export interface SyncHandlerDeps {
  tenantRepo: TenantRepository;
  authMiddleware: AuthMiddleware;
  db: DatabaseClient;
  config: Config;
}

export interface ManualSyncResult {
  success: boolean;
  productsUpdated: number;
  alertsGenerated: number;
  duration: number;
  error?: string;
}

export interface SyncRoutes {
  trigger: (req: Request) => Promise<Response>;
}

export function createSyncRoutes(deps: SyncHandlerDeps): SyncRoutes {
  const { tenantRepo, authMiddleware, db, config } = deps;

  return {
    async trigger(req: Request): Promise<Response> {
      let authContext: AuthContext;
      try {
        authContext = await authMiddleware.authenticate(req);
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationError") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        const tenant = await tenantRepo.getById(authContext.tenantId);

        if (!tenant) {
          return Response.json({ error: "Tenant not found" }, { status: 404 });
        }

        const startTime = Date.now();

        const result: SyncJobResult = await runSyncAndAlerts(db, config);

        const duration = Date.now() - startTime;

        // Find the result for this specific tenant
        const tenantResult = result.syncProgress.results.find(
          (r) => r.tenantId === authContext.tenantId
        );

        const response: ManualSyncResult = {
          success: tenantResult?.success ?? false,
          productsUpdated: tenantResult?.itemsSynced ?? 0,
          alertsGenerated: result.totalAlertsCreated,
          duration,
        };

        if (tenantResult?.error) {
          response.error = tenantResult.error;
        }

        return Response.json(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Sync failed";
        console.error("Manual sync error:", error);

        return Response.json(
          {
            success: false,
            productsUpdated: 0,
            alertsGenerated: 0,
            duration: 0,
            error: errorMessage,
          } satisfies ManualSyncResult,
          { status: 500 }
        );
      }
    },
  };
}
