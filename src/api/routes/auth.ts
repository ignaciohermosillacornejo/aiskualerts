import { z } from "zod";
import { jsonWithCors, createValidationErrorResponse } from "./utils";
import type { SessionRepository } from "@/db/repositories/session";
import type { UserRepository } from "@/db/repositories/user";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { UserTenantsRepository } from "@/db/repositories/user-tenants";
import { extractSessionToken } from "@/utils/cookies";

// Zod schema for login
export const LoginSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export interface AuthRouteDeps {
  sessionRepo?: SessionRepository | undefined;
  userRepo?: UserRepository | undefined;
  tenantRepo?: TenantRepository | undefined;
  userTenantsRepo?: UserTenantsRepository | undefined;
}

export interface AuthRoutes {
  "/api/auth/login": {
    POST: (req: Request) => Promise<Response>;
  };
  "/api/auth/logout": {
    POST: (req: Request) => Response;
  };
  "/api/auth/me": {
    GET: (req: Request) => Promise<Response>;
  };
}

export function createAuthRoutes(deps: AuthRouteDeps = {}): AuthRoutes {
  return {
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
      GET: async (req) => {
        const cookie = req.headers.get("Cookie") ?? "";
        const sessionToken = extractSessionToken(cookie);

        if (!sessionToken) {
          return jsonWithCors({ user: null }, { status: 401 });
        }

        // If we have repositories, use real session/user lookup
        if (deps.sessionRepo && deps.userRepo) {
          const session = await deps.sessionRepo.findByToken(sessionToken);
          if (!session) {
            return jsonWithCors({ user: null }, { status: 401 });
          }

          const user = await deps.userRepo.getById(session.userId);
          if (!user) {
            return jsonWithCors({ user: null }, { status: 401 });
          }

          // Get tenants list if userTenantsRepo available
          let tenants: {
            id: string;
            name: string | null;
            bsaleClientCode: string | null;
            role: string;
            syncStatus: string;
          }[] = [];
          let role: string | null = null;

          if (deps.userTenantsRepo) {
            const userTenants = await deps.userTenantsRepo.getTenantsForUser(
              user.id
            );
            tenants = userTenants.map((ut) => ({
              id: ut.tenant_id,
              name: ut.tenant_name,
              bsaleClientCode: ut.bsale_client_code,
              role: ut.role,
              syncStatus: ut.sync_status,
            }));

            // Get role for current tenant
            if (session.currentTenantId) {
              role = await deps.userTenantsRepo.getRole(
                user.id,
                session.currentTenantId
              );
            }
          }

          // Get current tenant details if available
          let currentTenant: {
            id: string;
            name: string | null;
            bsaleClientCode: string | null;
            syncStatus: string;
          } | null = null;

          if (session.currentTenantId && deps.tenantRepo) {
            const tenant = await deps.tenantRepo.getById(session.currentTenantId);
            if (tenant) {
              currentTenant = {
                id: tenant.id,
                name: tenant.bsale_client_name,
                bsaleClientCode: tenant.bsale_client_code,
                syncStatus: tenant.sync_status,
              };
            }
          }

          return jsonWithCors({
            user: {
              id: user.id,
              email: user.email,
              name: user.name ?? "Usuario",
              subscriptionStatus: user.subscription_status,
            },
            currentTenant,
            tenants,
            role,
          });
        }

        // Fallback to mock data for testing/development without DB
        return jsonWithCors({
          user: {
            id: "u1",
            email: "demo@empresa.cl",
            name: "Usuario Demo",
            subscriptionStatus: "none",
          },
          currentTenant: null,
          tenants: [],
          role: null,
        });
      },
    },
  };
}
