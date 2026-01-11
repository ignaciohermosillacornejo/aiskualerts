import { test, expect, describe, mock, type Mock } from "bun:test";
import { UserRepository } from "@/db/repositories/user";
import type { DatabaseClient } from "@/db/client";
import type { User } from "@/db/repositories/types";

const mockUser: User = {
  id: "user-123",
  tenant_id: "tenant-456",
  email: "test@example.com",
  notification_enabled: true,
  created_at: new Date("2024-01-01"),
  updated_at: new Date("2024-01-01"),
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
});
