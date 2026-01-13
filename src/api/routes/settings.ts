import { z } from "zod";
import type { UserRepository } from "@/db/repositories/user";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import { jsonWithCors, createValidationErrorResponse } from "./utils";

export interface SettingsRouteDeps {
  userRepo?: UserRepository | undefined;
  tenantRepo?: TenantRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
}

// Zod schema for settings update
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

// Mock data for development
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

export interface SettingsRoutes {
  "/api/settings": {
    GET: (req: Request) => Promise<Response>;
    PUT: (req: Request) => Promise<Response>;
  };
}

export function createSettingsRoutes(deps: SettingsRouteDeps): SettingsRoutes {
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
    "/api/settings": {
      GET: async (req) => {
        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If userRepo and tenantRepo available and authenticated, use real data
        if (authContext && deps.userRepo && deps.tenantRepo) {
          const [user, tenant] = await Promise.all([
            deps.userRepo.getById(authContext.userId),
            deps.tenantRepo.getById(authContext.tenantId),
          ]);

          if (!user || !tenant) {
            return jsonWithCors(mockSettings, undefined, req);
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
          }, undefined, req);
        }

        // Fallback to mock data
        return jsonWithCors(mockSettings, undefined, req);
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
        if (authContext && deps.userRepo && deps.tenantRepo) {
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
          }, undefined, req);
        }

        // Fallback to mock data
        Object.assign(mockSettings, body);
        return jsonWithCors(mockSettings, undefined, req);
      },
    },
  };
}
