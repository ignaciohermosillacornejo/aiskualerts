import { test, expect, describe, mock } from "bun:test";
import { createThresholdRoutes } from "../../../../src/api/routes/thresholds";
import type { ThresholdRepository } from "../../../../src/db/repositories/threshold";
import type { AuthMiddleware } from "../../../../src/api/middleware/auth";
import type { ThresholdLimitService } from "../../../../src/billing/threshold-limit-service";

describe("GET /api/thresholds with limit service", () => {
  test("includes isActive field based on threshold limit service", async () => {
    const mockThresholdRepo = {
      getByUserPaginated: mock(() =>
        Promise.resolve({
          data: [
            { id: "t1", user_id: "user-1", tenant_id: "tenant-1", bsale_variant_id: 100, min_quantity: 10, created_at: new Date(), updated_at: new Date() },
            { id: "t2", user_id: "user-1", tenant_id: "tenant-1", bsale_variant_id: 200, min_quantity: 20, created_at: new Date(), updated_at: new Date() },
          ],
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        })
      ),
    };

    const mockThresholdLimitService = {
      getActiveThresholdIds: mock(() => Promise.resolve(new Set(["t1"]))),
      getUserLimitInfo: mock(),
      getSkippedCount: mock(),
    };

    const mockAuthMiddleware = {
      authenticate: mock(() =>
        Promise.resolve({ userId: "user-1", tenantId: "tenant-1" })
      ),
    };

    const routes = createThresholdRoutes({
      thresholdRepo: mockThresholdRepo as unknown as ThresholdRepository,
      authMiddleware: mockAuthMiddleware as unknown as AuthMiddleware,
      thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
    });

    const response = await routes["/api/thresholds"].GET(
      new Request("http://localhost/api/thresholds")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].isActive).toBe(true);
    expect(body.data[1].isActive).toBe(false);
  });

  test("all thresholds are active when no limit service is provided", async () => {
    const mockThresholdRepo = {
      getByUserPaginated: mock(() =>
        Promise.resolve({
          data: [
            { id: "t1", user_id: "user-1", tenant_id: "tenant-1", bsale_variant_id: 100, min_quantity: 10, created_at: new Date(), updated_at: new Date() },
            { id: "t2", user_id: "user-1", tenant_id: "tenant-1", bsale_variant_id: 200, min_quantity: 20, created_at: new Date(), updated_at: new Date() },
          ],
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        })
      ),
    };

    const mockAuthMiddleware = {
      authenticate: mock(() =>
        Promise.resolve({ userId: "user-1", tenantId: "tenant-1" })
      ),
    };

    const routes = createThresholdRoutes({
      thresholdRepo: mockThresholdRepo as unknown as ThresholdRepository,
      authMiddleware: mockAuthMiddleware as unknown as AuthMiddleware,
      // No thresholdLimitService provided
    });

    const response = await routes["/api/thresholds"].GET(
      new Request("http://localhost/api/thresholds")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // When no limit service, all thresholds should be active
    expect(body.data[0].isActive).toBe(true);
    expect(body.data[1].isActive).toBe(true);
  });

  test("handles limit service error gracefully by treating all as active", async () => {
    const mockThresholdRepo = {
      getByUserPaginated: mock(() =>
        Promise.resolve({
          data: [
            { id: "t1", user_id: "user-1", tenant_id: "tenant-1", bsale_variant_id: 100, min_quantity: 10, created_at: new Date(), updated_at: new Date() },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        })
      ),
    };

    const mockThresholdLimitService = {
      getActiveThresholdIds: mock(() => Promise.reject(new Error("User not found"))),
      getUserLimitInfo: mock(),
      getSkippedCount: mock(),
    };

    const mockAuthMiddleware = {
      authenticate: mock(() =>
        Promise.resolve({ userId: "user-1", tenantId: "tenant-1" })
      ),
    };

    const routes = createThresholdRoutes({
      thresholdRepo: mockThresholdRepo as unknown as ThresholdRepository,
      authMiddleware: mockAuthMiddleware as unknown as AuthMiddleware,
      thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
    });

    const response = await routes["/api/thresholds"].GET(
      new Request("http://localhost/api/thresholds")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // On error, treat all as active for graceful degradation
    expect(body.data[0].isActive).toBe(true);
  });
});
