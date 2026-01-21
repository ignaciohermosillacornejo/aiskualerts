import { z } from "zod";
import { jsonWithCors, createValidationErrorResponse } from "./utils";
import type { AuthMiddleware, AuthContext } from "../middleware/auth";
import type { SessionRepository } from "@/db/repositories/session";
import type { UserRepository } from "@/db/repositories/user";
import type { UserTenantsRepository } from "@/db/repositories/user-tenants";
import { handleGetTenants } from "../handlers/tenants";
import { handleTenantSwitch, TenantSwitchError } from "../handlers/tenant-switch";
import { extractSessionToken } from "@/utils/cookies";
import { logger } from "@/utils/logger";

const switchTenantSchema = z.object({
  tenantId: z.uuid("Invalid tenant ID format"),
});

export interface TenantRoutesDeps {
  sessionRepo: SessionRepository;
  userRepo: UserRepository;
  userTenantsRepo: UserTenantsRepository;
}

export interface TenantRoutes {
  "/api/tenants": {
    GET: (req: Request) => Promise<Response>;
  };
  "/api/tenants/switch": {
    POST: (req: Request) => Promise<Response>;
  };
}

export function createTenantRoutes(
  deps: TenantRoutesDeps,
  authMiddleware: AuthMiddleware
): TenantRoutes {
  return {
    "/api/tenants": {
      GET: async (req: Request): Promise<Response> => {
        let authContext: AuthContext;
        try {
          authContext = await authMiddleware.authenticate(req);
        } catch (error) {
          logger.warn("Tenants list authentication failed", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const result = await handleGetTenants(
            { userId: authContext.userId },
            { userTenantsRepo: deps.userTenantsRepo }
          );

          return jsonWithCors(result);
        } catch (error) {
          logger.error(
            "Failed to get tenants list",
            error instanceof Error ? error : new Error("Unknown error"),
            { userId: authContext.userId }
          );
          return jsonWithCors(
            { error: "Failed to retrieve tenants" },
            { status: 500 }
          );
        }
      },
    },

    "/api/tenants/switch": {
      POST: async (req: Request): Promise<Response> => {
        let authContext: AuthContext;
        try {
          authContext = await authMiddleware.authenticate(req);
        } catch (error) {
          logger.warn("Tenant switch authentication failed", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
        }

        // Parse and validate request body
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return jsonWithCors(
            { error: "Invalid JSON body" },
            { status: 400 }
          );
        }

        const parseResult = switchTenantSchema.safeParse(body);
        if (!parseResult.success) {
          return createValidationErrorResponse(parseResult.error);
        }

        // Get session token from cookie
        const cookie = req.headers.get("Cookie") ?? "";
        const sessionToken = extractSessionToken(cookie);
        if (!sessionToken) {
          return jsonWithCors({ error: "No session token" }, { status: 401 });
        }

        try {
          await handleTenantSwitch(
            { tenantId: parseResult.data.tenantId },
            { userId: authContext.userId, sessionToken },
            {
              sessionRepo: deps.sessionRepo,
              userRepo: deps.userRepo,
              userTenantsRepo: deps.userTenantsRepo,
            }
          );

          return jsonWithCors({ success: true });
        } catch (error) {
          if (error instanceof TenantSwitchError) {
            logger.warn("Tenant switch denied", {
              error: error.message,
              userId: authContext.userId,
              targetTenantId: parseResult.data.tenantId,
            });
            return jsonWithCors({ error: error.message }, { status: 403 });
          }

          logger.error(
            "Tenant switch failed",
            error instanceof Error ? error : new Error("Unknown error"),
            {
              userId: authContext.userId,
              targetTenantId: parseResult.data.tenantId,
            }
          );
          return jsonWithCors(
            { error: "Failed to switch tenant" },
            { status: 500 }
          );
        }
      },
    },
  };
}
