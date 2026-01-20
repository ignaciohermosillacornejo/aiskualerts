import { test, expect, describe, beforeEach, mock } from "bun:test";
import { createSettingsRoutes } from "../../../../src/api/routes/settings";
import type { UserRepository } from "../../../../src/db/repositories/user";
import type { TenantRepository } from "../../../../src/db/repositories/tenant";
import type { AuthMiddleware, AuthContext } from "../../../../src/api/middleware/auth";
import type { ThresholdLimitService, LimitInfo } from "../../../../src/billing/threshold-limit-service";
import { PLANS } from "../../../../src/billing/plans";

describe("Settings Routes - Limits Endpoint", () => {
  // Mock repositories and services
  let mockUserRepo: { getById: ReturnType<typeof mock> };
  let mockTenantRepo: { getById: ReturnType<typeof mock> };
  let mockAuthMiddleware: AuthMiddleware;
  let mockThresholdLimitService: { getUserLimitInfo: ReturnType<typeof mock> };

  // Helper to create authenticated request
  function createAuthenticatedRequest(path = "/api/settings/limits"): Request {
    return new Request(`http://localhost${path}`, {
      headers: {
        Cookie: "session_token=valid-session-token",
      },
    });
  }

  beforeEach(() => {
    mockUserRepo = {
      getById: mock(() =>
        Promise.resolve({
          id: "user-1",
          tenant_id: "tenant-1",
          email: "test@example.com",
          name: "Test User",
          notification_enabled: true,
          notification_email: "test@example.com",
          digest_frequency: "daily" as const,
          subscription_status: "none",
          subscription_ends_at: null,
        })
      ),
    };

    mockTenantRepo = {
      getById: mock(() =>
        Promise.resolve({
          id: "tenant-1",
          bsale_client_code: "test-client",
          bsale_client_name: "Test Company",
          bsale_access_token: "access-token",
          sync_status: "success" as const,
          last_sync_at: new Date(),
          subscription_status: "none",
          subscription_ends_at: null,
        })
      ),
    };

    mockAuthMiddleware = {
      authenticate: mock(() =>
        Promise.resolve({
          userId: "user-1",
          tenantId: "tenant-1",
        } as AuthContext)
      ),
    };

    mockThresholdLimitService = {
      getUserLimitInfo: mock(() =>
        Promise.resolve({
          plan: PLANS.FREE,
          currentCount: 45,
          maxAllowed: 50,
          remaining: 5,
          isOverLimit: false,
        } as LimitInfo)
      ),
    };
  });

  describe("GET /api/settings/limits", () => {
    test("returns user limit info for FREE plan", async () => {
      const routes = createSettingsRoutes({
        userRepo: mockUserRepo as unknown as UserRepository,
        tenantRepo: mockTenantRepo as unknown as TenantRepository,
        authMiddleware: mockAuthMiddleware,
        thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
      });

      const response = await routes["/api/settings/limits"].GET(
        createAuthenticatedRequest()
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        plan: string;
        thresholds: {
          current: number;
          max: number | null;
          remaining: number | null;
          isOverLimit: boolean;
        };
      };
      expect(body).toEqual({
        plan: "FREE",
        thresholds: {
          current: 45,
          max: 50,
          remaining: 5,
          isOverLimit: false,
        },
      });
    });

    test("returns null for max and remaining when user has PRO plan (Infinity)", async () => {
      mockThresholdLimitService.getUserLimitInfo.mockImplementation(() =>
        Promise.resolve({
          plan: PLANS.PRO,
          currentCount: 150,
          maxAllowed: Infinity,
          remaining: Infinity,
          isOverLimit: false,
        } as LimitInfo)
      );

      const routes = createSettingsRoutes({
        userRepo: mockUserRepo as unknown as UserRepository,
        tenantRepo: mockTenantRepo as unknown as TenantRepository,
        authMiddleware: mockAuthMiddleware,
        thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
      });

      const response = await routes["/api/settings/limits"].GET(
        createAuthenticatedRequest()
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        plan: string;
        thresholds: {
          current: number;
          max: number | null;
          remaining: number | null;
          isOverLimit: boolean;
        };
      };
      expect(body).toEqual({
        plan: "PRO",
        thresholds: {
          current: 150,
          max: null,
          remaining: null,
          isOverLimit: false,
        },
      });
    });

    test("returns isOverLimit true when user exceeds limit", async () => {
      mockThresholdLimitService.getUserLimitInfo.mockImplementation(() =>
        Promise.resolve({
          plan: PLANS.FREE,
          currentCount: 55,
          maxAllowed: 50,
          remaining: 0,
          isOverLimit: true,
        } as LimitInfo)
      );

      const routes = createSettingsRoutes({
        userRepo: mockUserRepo as unknown as UserRepository,
        tenantRepo: mockTenantRepo as unknown as TenantRepository,
        authMiddleware: mockAuthMiddleware,
        thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
      });

      const response = await routes["/api/settings/limits"].GET(
        createAuthenticatedRequest()
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        plan: string;
        thresholds: {
          current: number;
          max: number | null;
          remaining: number | null;
          isOverLimit: boolean;
        };
      };
      expect(body).toEqual({
        plan: "FREE",
        thresholds: {
          current: 55,
          max: 50,
          remaining: 0,
          isOverLimit: true,
        },
      });
    });

    test("returns 401 when not authenticated", async () => {
      const failingAuthMiddleware: AuthMiddleware = {
        authenticate: mock(() =>
          Promise.reject(new Error("Unauthorized"))
        ),
      };

      const routes = createSettingsRoutes({
        userRepo: mockUserRepo as unknown as UserRepository,
        tenantRepo: mockTenantRepo as unknown as TenantRepository,
        authMiddleware: failingAuthMiddleware,
        thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
      });

      const response = await routes["/api/settings/limits"].GET(
        new Request("http://localhost/api/settings/limits")
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 500 when thresholdLimitService throws error", async () => {
      mockThresholdLimitService.getUserLimitInfo.mockImplementation(() =>
        Promise.reject(new Error("Service error"))
      );

      const routes = createSettingsRoutes({
        userRepo: mockUserRepo as unknown as UserRepository,
        tenantRepo: mockTenantRepo as unknown as TenantRepository,
        authMiddleware: mockAuthMiddleware,
        thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
      });

      const response = await routes["/api/settings/limits"].GET(
        createAuthenticatedRequest()
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Failed to retrieve limit info");
    });

    test("returns mock data when thresholdLimitService is not configured", async () => {
      const routes = createSettingsRoutes({
        userRepo: mockUserRepo as unknown as UserRepository,
        tenantRepo: mockTenantRepo as unknown as TenantRepository,
        authMiddleware: mockAuthMiddleware,
        // No thresholdLimitService
      });

      const response = await routes["/api/settings/limits"].GET(
        createAuthenticatedRequest()
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        plan: string;
        thresholds: {
          current: number;
          max: number;
          remaining: number;
          isOverLimit: boolean;
        };
      };
      // Should return mock data
      expect(body.plan).toBe("FREE");
      expect(typeof body.thresholds.current).toBe("number");
      expect(typeof body.thresholds.max).toBe("number");
    });

    test("calls getUserLimitInfo with correct userId", async () => {
      const routes = createSettingsRoutes({
        userRepo: mockUserRepo as unknown as UserRepository,
        tenantRepo: mockTenantRepo as unknown as TenantRepository,
        authMiddleware: mockAuthMiddleware,
        thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
      });

      await routes["/api/settings/limits"].GET(createAuthenticatedRequest());

      expect(mockThresholdLimitService.getUserLimitInfo).toHaveBeenCalledWith(
        "user-1"
      );
    });
  });
});
