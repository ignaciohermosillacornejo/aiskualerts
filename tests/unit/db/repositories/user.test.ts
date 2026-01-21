/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, mock, type Mock } from "bun:test";
import { UserRepository } from "@/db/repositories/user";
import type { DatabaseClient } from "@/db/client";
import type { User } from "@/db/repositories/types";

const mockUser: User = {
  id: "user-123",
  tenant_id: "tenant-456",
  email: "test@example.com",
  name: "Test User",
  last_tenant_id: null,
  notification_enabled: true,
  notification_email: null,
  digest_frequency: "daily",
  subscription_id: null,
  subscription_status: "none",
  subscription_ends_at: null,
  created_at: new Date("2024-01-01"),
};

interface MockDb {
  query: Mock<() => Promise<unknown[]>>;
  queryOne: Mock<() => Promise<unknown>>;
  execute: Mock<() => Promise<void>>;
}

function createMockDb(): { db: DatabaseClient; mocks: MockDb } {
  const mocks: MockDb = {
    query: mock(() => Promise.resolve([])),
    queryOne: mock(() => Promise.resolve(null)),
    execute: mock(() => Promise.resolve()),
  };
  return {
    db: mocks as unknown as DatabaseClient,
    mocks,
  };
}

describe("UserRepository", () => {
  describe("create", () => {
    test("creates user with all fields", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockUser]);

      const repo = new UserRepository(db);
      const result = await repo.create({
        tenant_id: "tenant-456",
        email: "test@example.com",
        name: "Test User",
        notification_enabled: true,
        notification_email: "alerts@example.com",
      });

      expect(result).toEqual(mockUser);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("creates user with minimum required fields", async () => {
      const { db, mocks } = createMockDb();
      const minimalUser = { ...mockUser, name: null, notification_email: null };
      mocks.query.mockResolvedValue([minimalUser]);

      const repo = new UserRepository(db);
      const result = await repo.create({
        tenant_id: "tenant-456",
        email: "test@example.com",
      });

      expect(result.email).toBe("test@example.com");
      expect(mocks.query).toHaveBeenCalled();
    });

    test("throws error when creation fails", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new UserRepository(db);

      await expect(
        repo.create({
          tenant_id: "tenant-456",
          email: "test@example.com",
        })
      ).rejects.toThrow("Failed to create user");
    });

    test("uses default notification_enabled when not provided", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([{ ...mockUser, notification_enabled: true }]);

      const repo = new UserRepository(db);
      const result = await repo.create({
        tenant_id: "tenant-456",
        email: "test@example.com",
      });

      expect(result.notification_enabled).toBe(true);
    });
  });

  describe("getByTenant", () => {
    test("returns users for tenant", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockUser]);

      const repo = new UserRepository(db);
      const result = await repo.getByTenant("tenant-456");

      expect(result).toEqual([mockUser]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no users", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new UserRepository(db);
      const result = await repo.getByTenant("tenant-456");

      expect(result).toEqual([]);
    });
  });

  describe("getById", () => {
    test("returns user when found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockUser);

      const repo = new UserRepository(db);
      const result = await repo.getById("user-123");

      expect(result).toEqual(mockUser);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when user not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new UserRepository(db);
      const result = await repo.getById("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("getByEmail", () => {
    test("returns user when found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockUser);

      const repo = new UserRepository(db);
      const result = await repo.getByEmail("tenant-456", "test@example.com");

      expect(result).toEqual(mockUser);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when user not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new UserRepository(db);
      const result = await repo.getByEmail("tenant-456", "notfound@example.com");

      expect(result).toBeNull();
    });
  });

  describe("getWithNotificationsEnabled", () => {
    test("returns users with notifications enabled", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockUser]);

      const repo = new UserRepository(db);
      const result = await repo.getWithNotificationsEnabled("tenant-456");

      expect(result).toEqual([mockUser]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no users have notifications enabled", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new UserRepository(db);
      const result = await repo.getWithNotificationsEnabled("tenant-456");

      expect(result).toEqual([]);
    });
  });

  describe("getWithDigestEnabled", () => {
    test("returns users with daily digest enabled", async () => {
      const { db, mocks } = createMockDb();
      const dailyUser = { ...mockUser, digest_frequency: "daily" as const };
      mocks.query.mockResolvedValue([dailyUser]);

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabled("tenant-456", "daily");

      expect(result).toEqual([dailyUser]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns users with weekly digest enabled", async () => {
      const { db, mocks } = createMockDb();
      const weeklyUser = { ...mockUser, digest_frequency: "weekly" as const };
      mocks.query.mockResolvedValue([weeklyUser]);

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabled("tenant-456", "weekly");

      expect(result).toEqual([weeklyUser]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no users have specified digest frequency", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabled("tenant-456", "daily");

      expect(result).toEqual([]);
    });
  });

  describe("getWithDigestEnabledBatch", () => {
    test("returns empty array for empty tenant ids", async () => {
      const { db, mocks } = createMockDb();

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabledBatch([], "daily");

      expect(result).toEqual([]);
      expect(mocks.query).not.toHaveBeenCalled();
    });

    test("returns users from multiple tenants with daily digest enabled", async () => {
      const { db, mocks } = createMockDb();
      const user1 = { ...mockUser, tenant_id: "tenant-1", digest_frequency: "daily" as const };
      const user2 = { ...mockUser, id: "user-456", tenant_id: "tenant-2", digest_frequency: "daily" as const };
      mocks.query.mockResolvedValue([user1, user2]);

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabledBatch(["tenant-1", "tenant-2"], "daily");

      expect(result).toEqual([user1, user2]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns users with weekly digest enabled from batch", async () => {
      const { db, mocks } = createMockDb();
      const weeklyUser = { ...mockUser, digest_frequency: "weekly" as const };
      mocks.query.mockResolvedValue([weeklyUser]);

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabledBatch(["tenant-456"], "weekly");

      expect(result).toEqual([weeklyUser]);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns empty array when no users have specified digest frequency in batch", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabledBatch(["tenant-1", "tenant-2"], "daily");

      expect(result).toEqual([]);
    });

    test("handles single tenant in batch", async () => {
      const { db, mocks } = createMockDb();
      const dailyUser = { ...mockUser, digest_frequency: "daily" as const };
      mocks.query.mockResolvedValue([dailyUser]);

      const repo = new UserRepository(db);
      const result = await repo.getWithDigestEnabledBatch(["tenant-456"], "daily");

      expect(result).toEqual([dailyUser]);
      expect(mocks.query).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    test("updates user name", async () => {
      const { db, mocks } = createMockDb();
      const updatedUser = { ...mockUser, name: "Updated Name" };
      mocks.query.mockResolvedValue([updatedUser]);

      const repo = new UserRepository(db);
      const result = await repo.update("user-123", { name: "Updated Name" });

      expect(result.name).toBe("Updated Name");
      expect(mocks.query).toHaveBeenCalled();
    });

    test("updates notification_enabled", async () => {
      const { db, mocks } = createMockDb();
      const updatedUser = { ...mockUser, notification_enabled: false };
      mocks.query.mockResolvedValue([updatedUser]);

      const repo = new UserRepository(db);
      const result = await repo.update("user-123", { notification_enabled: false });

      expect(result.notification_enabled).toBe(false);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("updates notification_email", async () => {
      const { db, mocks } = createMockDb();
      const updatedUser = { ...mockUser, notification_email: "new@example.com" };
      mocks.query.mockResolvedValue([updatedUser]);

      const repo = new UserRepository(db);
      const result = await repo.update("user-123", { notification_email: "new@example.com" });

      expect(result.notification_email).toBe("new@example.com");
      expect(mocks.query).toHaveBeenCalled();
    });

    test("updates digest_frequency", async () => {
      const { db, mocks } = createMockDb();
      const updatedUser = { ...mockUser, digest_frequency: "weekly" as const };
      mocks.query.mockResolvedValue([updatedUser]);

      const repo = new UserRepository(db);
      const result = await repo.update("user-123", { digest_frequency: "weekly" });

      expect(result.digest_frequency).toBe("weekly");
      expect(mocks.query).toHaveBeenCalled();
    });

    test("updates multiple fields at once", async () => {
      const { db, mocks } = createMockDb();
      const updatedUser = {
        ...mockUser,
        notification_enabled: false,
        digest_frequency: "none" as const,
      };
      mocks.query.mockResolvedValue([updatedUser]);

      const repo = new UserRepository(db);
      const result = await repo.update("user-123", {
        notification_enabled: false,
        digest_frequency: "none",
      });

      expect(result.notification_enabled).toBe(false);
      expect(result.digest_frequency).toBe("none");
    });

    test("returns existing user when no updates provided", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockUser);

      const repo = new UserRepository(db);
      const result = await repo.update("user-123", {});

      expect(result).toEqual(mockUser);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("throws error when user not found with no updates", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new UserRepository(db);

      await expect(repo.update("non-existent", {})).rejects.toThrow("User non-existent not found");
    });

    test("throws error when user not found during update", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new UserRepository(db);

      await expect(repo.update("non-existent", { name: "Test" })).rejects.toThrow(
        "User non-existent not found"
      );
    });
  });

  describe("create with digest_frequency", () => {
    test("creates user with custom digest_frequency", async () => {
      const { db, mocks } = createMockDb();
      const weeklyUser = { ...mockUser, digest_frequency: "weekly" as const };
      mocks.query.mockResolvedValue([weeklyUser]);

      const repo = new UserRepository(db);
      const result = await repo.create({
        tenant_id: "tenant-456",
        email: "test@example.com",
        digest_frequency: "weekly",
      });

      expect(result.digest_frequency).toBe("weekly");
    });

    test("creates user with none digest_frequency", async () => {
      const { db, mocks } = createMockDb();
      const noneUser = { ...mockUser, digest_frequency: "none" as const };
      mocks.query.mockResolvedValue([noneUser]);

      const repo = new UserRepository(db);
      const result = await repo.create({
        tenant_id: "tenant-456",
        email: "test@example.com",
        digest_frequency: "none",
      });

      expect(result.digest_frequency).toBe("none");
    });
  });

  describe("subscription methods", () => {
    test("activateSubscription sets subscription columns", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([{ id: "user-1" }]);

      const repo = new UserRepository(db);
      await repo.activateSubscription("user-1", "sub_123");

      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining("subscription_id"),
        expect.arrayContaining(["user-1", "sub_123", "active"])
      );
    });

    test("updateSubscriptionStatus updates status and ends_at", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([{ id: "user-1" }]);

      const repo = new UserRepository(db);
      const endsAt = new Date("2026-02-01");

      await repo.updateSubscriptionStatus("sub_123", "cancelled", endsAt);

      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining("subscription_status"),
        expect.arrayContaining(["cancelled", endsAt, "sub_123"])
      );
    });

    test("findBySubscriptionId returns user with subscription", async () => {
      const mockUserWithSubscription = {
        ...mockUser,
        subscription_id: "sub_123",
        subscription_status: "active" as const,
        subscription_ends_at: null,
      };
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([mockUserWithSubscription]);

      const repo = new UserRepository(db);
      const result = await repo.findBySubscriptionId("sub_123");

      expect(result).toEqual(mockUserWithSubscription);
    });

    test("findBySubscriptionId returns null when not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new UserRepository(db);
      const result = await repo.findBySubscriptionId("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getByEmailGlobal", () => {
    test("returns user when found by email globally", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(mockUser);

      const repo = new UserRepository(db);
      const result = await repo.getByEmailGlobal("test@example.com");

      expect(result).toEqual(mockUser);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when user not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new UserRepository(db);
      const result = await repo.getByEmailGlobal("notfound@example.com");

      expect(result).toBeNull();
    });
  });

  describe("updateLastTenant", () => {
    test("updates last_tenant_id", async () => {
      const { db, mocks } = createMockDb();
      const updatedUser = { ...mockUser, last_tenant_id: "tenant-789" };
      mocks.queryOne.mockResolvedValue(updatedUser);

      const repo = new UserRepository(db);
      const result = await repo.updateLastTenant("user-123", "tenant-789");

      expect(result?.last_tenant_id).toBe("tenant-789");
      const call = mocks.queryOne.mock.calls[0] as unknown[];
      expect(call?.[0]).toContain("UPDATE users");
      expect(call?.[0]).toContain("last_tenant_id");
    });

    test("returns null if user not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new UserRepository(db);
      const result = await repo.updateLastTenant("non-existent", "tenant-789");

      expect(result).toBeNull();
    });
  });
});
