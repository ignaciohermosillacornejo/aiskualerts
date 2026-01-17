import { test, expect, describe, mock, type Mock, beforeEach } from "bun:test";
import { createSyncRoutes, type SyncHandlerDeps, type ManualSyncResult } from "@/api/handlers/sync";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import type { DatabaseClient } from "@/db/client";
import type { Config } from "@/config";
import type { Tenant } from "@/db/repositories/types";
import { AuthenticationError } from "@/api/middleware/auth";
import * as syncJobModule from "@/jobs/sync-job";

const mockTenant: Tenant = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  bsale_client_code: "12345678-9",
  bsale_client_name: "Test Company",
  bsale_access_token: "test-token",
  sync_status: "pending",
  last_sync_at: null,
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockTenantWithoutBsale: Tenant = {
  ...mockTenant,
  bsale_access_token: null,
};

const mockConfig: Config = {
  port: 3000,
  nodeEnv: "test",
  allowedOrigins: [],
  syncEnabled: true,
  syncHour: 2,
  syncMinute: 0,
  syncBatchSize: 100,
  syncTenantDelay: 5000,
  digestEnabled: false,
  digestHour: 8,
  digestMinute: 0,
  bsaleAppId: "test-app-id",
  bsaleIntegratorToken: "test-integrator-token",
  bsaleRedirectUri: "http://localhost:3000/callback",
  resendApiKey: "re_123",
  notificationFromEmail: "test@example.com",
  sentryEnvironment: "test",
  mercadoPagoPlanAmount: 9990,
  mercadoPagoPlanCurrency: "CLP",
  magicLinkExpiryMinutes: 15,
  magicLinkRateLimitPerHour: 5,
};

interface MockTenantRepo {
  getById: Mock<() => Promise<Tenant | null>>;
}

interface MockAuthMiddleware {
  authenticate: Mock<() => Promise<AuthContext>>;
}

function createMocks() {
  const tenantRepo: MockTenantRepo = {
    getById: mock(() => Promise.resolve(mockTenant)),
  };

  const authMiddleware: MockAuthMiddleware = {
    authenticate: mock(() =>
      Promise.resolve({
        userId: "user-123",
        tenantId: mockTenant.id,
      })
    ),
  };

  const db = {} as DatabaseClient;

  const deps: SyncHandlerDeps = {
    tenantRepo: tenantRepo as unknown as TenantRepository,
    authMiddleware: authMiddleware as unknown as AuthMiddleware,
    db,
    config: mockConfig,
  };

  return { tenantRepo, authMiddleware, db, deps };
}

describe("createSyncRoutes", () => {
  let runSyncForTenantMock: Mock<typeof syncJobModule.runSyncForTenant>;

  beforeEach(() => {
    runSyncForTenantMock = mock(() => Promise.resolve());

    // Mock the module
    void mock.module("@/jobs/sync-job", () => ({
      runSyncForTenant: runSyncForTenantMock,
    }));
  });

  describe("trigger", () => {
    test("returns 202 Accepted and starts sync in background", async () => {
      const { deps } = createMocks();
      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(202);

      const body = (await response.json()) as ManualSyncResult;
      expect(body.success).toBe(true);
      expect(body.message).toBe("Sync started");
    });

    test("returns 401 when not authenticated", async () => {
      const { deps, authMiddleware } = createMocks();
      authMiddleware.authenticate.mockRejectedValue(
        new AuthenticationError("No session")
      );

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(401);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 401 for generic authentication error", async () => {
      const { deps, authMiddleware } = createMocks();
      authMiddleware.authenticate.mockRejectedValue(
        new Error("Unknown auth error")
      );

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(401);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 404 when tenant not found", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockResolvedValue(null);

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Tenant not found");
    });

    test("returns 400 when Bsale is not connected", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockResolvedValue(mockTenantWithoutBsale);

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(400);

      const body = (await response.json()) as ManualSyncResult;
      expect(body.success).toBe(false);
      expect(body.message).toBe("Bsale not connected");
      expect(body.error).toBe("bsale_not_connected");
    });
  });
});
