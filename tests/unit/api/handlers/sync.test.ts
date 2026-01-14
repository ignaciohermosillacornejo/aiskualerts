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
  stripe_customer_id: null,
  is_paid: false,
  created_at: new Date(),
  updated_at: new Date(),
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
  let runSyncAndAlertsMock: Mock<typeof syncJobModule.runSyncAndAlerts>;

  beforeEach(() => {
    runSyncAndAlertsMock = mock(() =>
      Promise.resolve({
        syncProgress: {
          totalTenants: 1,
          completedTenants: 1,
          successCount: 1,
          failureCount: 0,
          results: [
            {
              tenantId: mockTenant.id,
              success: true,
              itemsSynced: 50,
              startedAt: new Date(),
              completedAt: new Date(),
            },
          ],
        },
        alertResults: [],
        totalAlertsCreated: 5,
        startedAt: new Date(),
        completedAt: new Date(),
      })
    );

    // Mock the module
    void mock.module("@/jobs/sync-job", () => ({
      runSyncAndAlerts: runSyncAndAlertsMock,
    }));
  });

  describe("trigger", () => {
    test("returns sync result for authenticated user", async () => {
      const { deps } = createMocks();
      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as ManualSyncResult;
      expect(body.success).toBe(true);
      expect(body.productsUpdated).toBe(50);
      expect(body.alertsGenerated).toBe(5);
      expect(body.duration).toBeGreaterThanOrEqual(0);
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

    test("returns 500 when sync fails", async () => {
      const { deps } = createMocks();

      runSyncAndAlertsMock.mockRejectedValue(new Error("Sync service error"));

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(500);

      const body = (await response.json()) as ManualSyncResult;
      expect(body.success).toBe(false);
      expect(body.error).toBe("Sync service error");
      expect(body.productsUpdated).toBe(0);
      expect(body.alertsGenerated).toBe(0);
    });

    test("handles sync failure for specific tenant", async () => {
      const { deps } = createMocks();

      runSyncAndAlertsMock.mockResolvedValue({
        syncProgress: {
          totalTenants: 1,
          completedTenants: 1,
          successCount: 0,
          failureCount: 1,
          results: [
            {
              tenantId: mockTenant.id,
              success: false,
              itemsSynced: 0,
              error: "Bsale API error",
              startedAt: new Date(),
              completedAt: new Date(),
            },
          ],
        },
        alertResults: [],
        totalAlertsCreated: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as ManualSyncResult;
      expect(body.success).toBe(false);
      expect(body.error).toBe("Bsale API error");
    });

    test("handles missing tenant result in sync progress", async () => {
      const { deps } = createMocks();

      runSyncAndAlertsMock.mockResolvedValue({
        syncProgress: {
          totalTenants: 1,
          completedTenants: 1,
          successCount: 1,
          failureCount: 0,
          results: [
            {
              tenantId: "different-tenant-id",
              success: true,
              itemsSynced: 100,
              startedAt: new Date(),
              completedAt: new Date(),
            },
          ],
        },
        alertResults: [],
        totalAlertsCreated: 3,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(200);

      const body = (await response.json()) as ManualSyncResult;
      expect(body.success).toBe(false);
      expect(body.productsUpdated).toBe(0);
    });

    test("handles non-Error exception in sync", async () => {
      const { deps } = createMocks();

      runSyncAndAlertsMock.mockRejectedValue("Unknown error string");

      const routes = createSyncRoutes(deps);

      const req = new Request("http://localhost/api/sync/trigger", {
        method: "POST",
        headers: { Cookie: "session=valid-token" },
      });

      const response = await routes.trigger(req);
      expect(response.status).toBe(500);

      const body = (await response.json()) as ManualSyncResult;
      expect(body.success).toBe(false);
      expect(body.error).toBe("Sync failed");
    });
  });
});
