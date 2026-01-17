import type { TenantRepository } from "@/db/repositories/tenant";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import { runSyncForTenant } from "@/jobs/sync-job";
import { logger } from "@/utils/logger";

export interface SyncHandlerDeps {
  tenantRepo: TenantRepository;
  authMiddleware: AuthMiddleware;
  db: DatabaseClient;
  config: Config;
}

export interface ManualSyncResult {
  success: boolean;
  message: string;
  productsUpdated?: number;
  alertsGenerated?: number;
  duration?: number;
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

        if (!tenant.bsale_access_token) {
          return Response.json(
            { success: false, message: "Bsale not connected", error: "bsale_not_connected" },
            { status: 400 }
          );
        }

        // Run sync asynchronously - don't await the full sync
        // This prevents nginx timeout issues with long-running syncs
        runSyncForTenant(db, config, authContext.tenantId).catch((error: unknown) => {
          logger.error("Background sync failed", error instanceof Error ? error : new Error(String(error)), {
            tenantId: authContext.tenantId,
          });
        });

        const response: ManualSyncResult = {
          success: true,
          message: "Sync started",
        };

        return Response.json(response, { status: 202 });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Sync failed";
        logger.error("Manual sync error", error instanceof Error ? error : new Error(String(error)));

        return Response.json(
          {
            success: false,
            message: "Failed to start sync",
            error: errorMessage,
          } satisfies ManualSyncResult,
          { status: 500 }
        );
      }
    },
  };
}
