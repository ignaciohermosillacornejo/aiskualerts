// tests/unit/billing/subscription-service.test.ts
/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/unbound-method */
import { describe, test, expect, mock } from "bun:test";
import { SubscriptionService, type SubscriptionServiceDeps } from "@/billing/subscription-service";
import type { User, SubscriptionStatus } from "@/db/repositories/types";

describe("SubscriptionService", () => {
  const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: "user-123",
    tenant_id: "tenant-123",
    email: "test@example.com",
    name: "Test User",
    notification_enabled: true,
    notification_email: null,
    digest_frequency: "daily",
    subscription_id: null,
    subscription_status: "none" as SubscriptionStatus,
    subscription_ends_at: null,
    created_at: new Date(),
    ...overrides,
  });

  const createMockDeps = (overrides: {
    mercadoPagoClient?: {
      getSubscriptionStatus?: ReturnType<typeof mock>;
    };
    userRepo?: {
      activateSubscription?: ReturnType<typeof mock>;
      updateSubscriptionStatus?: ReturnType<typeof mock>;
    };
  } = {}): SubscriptionServiceDeps => ({
    mercadoPagoClient: {
      getSubscriptionStatus: mock(() =>
        Promise.resolve({
          status: "cancelled",
          nextPaymentDate: null,
          isActive: false,
        })
      ),
      ...overrides.mercadoPagoClient,
    } as unknown as SubscriptionServiceDeps["mercadoPagoClient"],
    userRepo: {
      activateSubscription: mock(() => Promise.resolve()),
      updateSubscriptionStatus: mock(() => Promise.resolve()),
      ...overrides.userRepo,
    } as unknown as SubscriptionServiceDeps["userRepo"],
  });

  describe("hasActiveAccess", () => {
    test("returns false when user has no subscription_id", async () => {
      const deps = createMockDeps();
      const service = new SubscriptionService(deps);
      const user = createMockUser({ subscription_id: null });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(false);
    });

    test("returns true when subscription_status is active", async () => {
      const deps = createMockDeps();
      const service = new SubscriptionService(deps);
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "active",
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(true);
    });

    test("returns true when cancelled but subscription_ends_at is in the future", async () => {
      const deps = createMockDeps();
      const service = new SubscriptionService(deps);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "cancelled",
        subscription_ends_at: futureDate,
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(true);
    });

    test("polls MercadoPago when cancelled and subscription_ends_at has passed", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const deps = createMockDeps({
        mercadoPagoClient: {
          getSubscriptionStatus: mock(() =>
            Promise.resolve({
              status: "cancelled",
              nextPaymentDate: null,
              isActive: false,
            })
          ),
        },
      });
      const service = new SubscriptionService(deps);
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "cancelled",
        subscription_ends_at: pastDate,
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(false);
      expect(deps.mercadoPagoClient.getSubscriptionStatus).toHaveBeenCalledWith(
        "sub-123"
      );
    });

    test("reactivates subscription when MercadoPago shows active status", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const deps = createMockDeps({
        mercadoPagoClient: {
          getSubscriptionStatus: mock(() =>
            Promise.resolve({
              status: "authorized",
              nextPaymentDate: new Date(),
              isActive: true,
            })
          ),
        },
      });
      const service = new SubscriptionService(deps);
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "cancelled",
        subscription_ends_at: pastDate,
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(true);
      expect(deps.userRepo.activateSubscription).toHaveBeenCalledWith(
        "user-123",
        "sub-123"
      );
    });

    test("updates subscription_ends_at when MercadoPago provides nextPaymentDate", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const newEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      const deps = createMockDeps({
        mercadoPagoClient: {
          getSubscriptionStatus: mock(() =>
            Promise.resolve({
              status: "cancelled",
              nextPaymentDate: newEndDate,
              isActive: false,
            })
          ),
        },
      });
      const service = new SubscriptionService(deps);
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "cancelled",
        subscription_ends_at: pastDate,
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(false);
      expect(deps.userRepo.updateSubscriptionStatus).toHaveBeenCalledWith(
        "sub-123",
        "cancelled",
        newEndDate
      );
    });

    test("returns false and denies access on MercadoPago API error (fail closed)", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const deps = createMockDeps({
        mercadoPagoClient: {
          getSubscriptionStatus: mock(() =>
            Promise.reject(new Error("API timeout"))
          ),
        },
      });
      const service = new SubscriptionService(deps);
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "cancelled",
        subscription_ends_at: pastDate,
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(false);
    });

    test("returns false when subscription_status is past_due", async () => {
      const deps = createMockDeps();
      const service = new SubscriptionService(deps);
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "past_due",
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(false);
    });

    test("returns false when subscription_status is none but has subscription_id", async () => {
      const deps = createMockDeps();
      const service = new SubscriptionService(deps);
      const user = createMockUser({
        subscription_id: "sub-123",
        subscription_status: "none",
      });

      const result = await service.hasActiveAccess(user);

      expect(result).toBe(false);
    });
  });
});
