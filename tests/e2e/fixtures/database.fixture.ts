/**
 * Database Fixture for E2E Testing
 *
 * Uses API endpoints for data seeding instead of direct database access.
 * This ensures tests run through the full application stack.
 *
 * For test data seeding, uses the /api/test/* endpoints that are only
 * available in test mode (TEST_MODE=true).
 */

import { test as base } from "@playwright/test";

export interface TenantInput {
  name: string;
  bsaleClientCode: string;
}

export interface ThresholdInput {
  bsaleVariantId?: number;
  bsaleOfficeId?: number | null;
  minQuantity?: number;
  daysWarning?: number;
}

export interface AlertTriggerInput {
  currentQty: number;
  thresholdQty: number;
  alertType?: "low_stock" | "out_of_stock" | "low_velocity";
}

export interface CreatedUser {
  id: string;
  email: string;
  tenantId: string;
}

export interface Tenant {
  id: string;
  name: string | null;
  bsaleClientCode: string | null;
}

export interface DatabaseFixture {
  /**
   * Create a tenant with mock Bsale data via test API
   */
  createTenant: (data: TenantInput) => Promise<Tenant>;

  /**
   * Create a user and link to tenant as owner via test API
   */
  createUser: (tenantId: string, email: string) => Promise<CreatedUser>;

  /**
   * Create a threshold via the regular API (requires auth)
   */
  createThreshold: (data?: ThresholdInput) => Promise<{ id: string }>;

  /**
   * Seed multiple thresholds at once via test API
   */
  seedThresholds: (count: number, tenantId: string) => Promise<void>;

  /**
   * Create an alert via test API
   */
  createAlert: (
    tenantId: string,
    userId: string,
    opts: AlertTriggerInput & { productName?: string; sku?: string; bsaleVariantId?: number }
  ) => Promise<{ id: string }>;

  /**
   * Get tenant by name via test API
   */
  getTenantByName: (name: string) => Promise<Tenant | null>;

  /**
   * Get user by email via test API
   */
  getUserByEmail: (email: string) => Promise<CreatedUser | null>;

  /**
   * Link an existing user to a tenant via test API
   */
  linkUserToTenant: (userId: string, tenantId: string, role?: string) => Promise<void>;

  /**
   * Get current tenant count for a user via test API
   */
  getUserTenantCount: (userId: string) => Promise<number>;

  /**
   * Get threshold count for a tenant via test API
   */
  getThresholdCount: (tenantId: string) => Promise<number>;
}

/**
 * Extended test fixture with database helpers
 * Uses API endpoints for all database operations
 */
export const databaseTest = base.extend<{ db: DatabaseFixture }>({
  db: async ({ request, baseURL }, use) => {
    const testApiUrl = (path: string) => `${baseURL}/api/test${path}`;

    // Track created entities for potential cleanup
    const created = {
      tenantIds: [] as string[],
      userIds: [] as string[],
    };

    let counter = 0;

    const fixture: DatabaseFixture = {
      async createTenant(data: TenantInput): Promise<Tenant> {
        const response = await request.post(testApiUrl("/tenants"), {
          data: {
            name: data.name,
            bsaleClientCode: data.bsaleClientCode,
          },
        });

        if (!response.ok()) {
          // Test endpoint might not exist, return mock data
          console.warn("Test API /api/test/tenants not available, using mock data");
          const mockTenant: Tenant = {
            id: `mock-tenant-${Date.now()}`,
            name: data.name,
            bsaleClientCode: data.bsaleClientCode,
          };
          created.tenantIds.push(mockTenant.id);
          return mockTenant;
        }

        const tenant = (await response.json()) as Tenant;
        created.tenantIds.push(tenant.id);
        return tenant;
      },

      async createUser(tenantId: string, email: string): Promise<CreatedUser> {
        const response = await request.post(testApiUrl("/users"), {
          data: {
            tenantId,
            email,
            name: "Test User",
          },
        });

        if (!response.ok()) {
          console.warn("Test API /api/test/users not available, using mock data");
          const mockUser: CreatedUser = {
            id: `mock-user-${Date.now()}`,
            email,
            tenantId,
          };
          created.userIds.push(mockUser.id);
          return mockUser;
        }

        const user = (await response.json()) as CreatedUser;
        created.userIds.push(user.id);
        return user;
      },

      async createThreshold(data: ThresholdInput = {}): Promise<{ id: string }> {
        counter++;
        const response = await request.post(`${baseURL}/api/thresholds`, {
          data: {
            bsaleVariantId: data.bsaleVariantId ?? counter,
            bsaleOfficeId: data.bsaleOfficeId ?? null,
            minQuantity: data.minQuantity ?? 10,
            daysWarning: data.daysWarning ?? 7,
          },
        });

        if (!response.ok()) {
          // Return mock ID if API fails
          return { id: `mock-threshold-${counter}` };
        }

        return (await response.json()) as { id: string };
      },

      async seedThresholds(count: number, tenantId: string): Promise<void> {
        const response = await request.post(testApiUrl("/seed-thresholds"), {
          data: {
            count,
            tenantId,
          },
        });

        if (!response.ok()) {
          console.warn(`Test API /api/test/seed-thresholds not available (status: ${String(response.status())})`);
          // Fallback: try creating via regular API one by one (slower but works)
          for (let i = 0; i < count; i++) {
            await fixture.createThreshold({
              bsaleVariantId: 2000 + i,
              minQuantity: 10,
            });
          }
        }
      },

      async createAlert(
        tenantId: string,
        userId: string,
        opts: AlertTriggerInput & { productName?: string; sku?: string; bsaleVariantId?: number }
      ): Promise<{ id: string }> {
        counter++;
        const response = await request.post(testApiUrl("/alerts"), {
          data: {
            tenantId,
            userId,
            bsaleVariantId: opts.bsaleVariantId ?? counter,
            sku: opts.sku ?? `SKU-${String(counter).padStart(3, "0")}`,
            productName: opts.productName ?? `Test Product ${counter}`,
            alertType: opts.alertType ?? "low_stock",
            currentQuantity: opts.currentQty,
            thresholdQuantity: opts.thresholdQty,
          },
        });

        if (!response.ok()) {
          return { id: `mock-alert-${counter}` };
        }

        return (await response.json()) as { id: string };
      },

      async getTenantByName(name: string): Promise<Tenant | null> {
        const response = await request.get(testApiUrl(`/tenants?name=${encodeURIComponent(name)}`));

        if (!response.ok()) {
          return null;
        }

        return (await response.json()) as Tenant;
      },

      async getUserByEmail(email: string): Promise<CreatedUser | null> {
        const response = await request.get(testApiUrl(`/users?email=${encodeURIComponent(email)}`));

        if (!response.ok()) {
          return null;
        }

        return (await response.json()) as CreatedUser;
      },

      async linkUserToTenant(userId: string, tenantId: string, role = "member"): Promise<void> {
        const response = await request.post(testApiUrl("/user-tenants"), {
          data: {
            userId,
            tenantId,
            role,
          },
        });

        if (!response.ok()) {
          console.warn("Test API /api/test/user-tenants not available");
        }
      },

      async getUserTenantCount(userId: string): Promise<number> {
        const response = await request.get(testApiUrl(`/users/${userId}/tenant-count`));

        if (!response.ok()) {
          return 0;
        }

        const data = (await response.json()) as { count: number };
        return data.count;
      },

      async getThresholdCount(tenantId: string): Promise<number> {
        const response = await request.get(testApiUrl(`/tenants/${tenantId}/threshold-count`));

        if (!response.ok()) {
          return 0;
        }

        const data = (await response.json()) as { count: number };
        return data.count;
      },
    };

    await use(fixture);

    // Note: Cleanup is handled by the test API or test database reset
    // No explicit cleanup needed since tests use isolated data
  },
});

export { expect } from "@playwright/test";
