/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { test, expect, describe, mock, type Mock } from "bun:test";
import { SessionRepository } from "@/db/repositories/session";
import type { DatabaseClient } from "@/db/client";
import type { Session } from "@/db/repositories/types";

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

describe("SessionRepository", () => {
  const mockSession: Session = {
    id: "session-123",
    userId: "user-456",
    token: "token-abc",
    expiresAt: new Date("2026-02-01"),
    createdAt: new Date("2026-01-01"),
  };

  describe("create", () => {
    test("creates session successfully", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([
        {
          id: mockSession.id,
          user_id: mockSession.userId,
          token: mockSession.token,
          expires_at: mockSession.expiresAt.toISOString(),
          created_at: mockSession.createdAt.toISOString(),
        },
      ]);

      const repo = new SessionRepository(db);
      const result = await repo.create({
        userId: "user-456",
        token: "token-abc",
        expiresAt: new Date("2026-02-01"),
      });

      expect(result).toEqual(mockSession);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("throws error when creation fails", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new SessionRepository(db);

      await expect(
        repo.create({
          userId: "user-456",
          token: "token-abc",
          expiresAt: new Date("2026-02-01"),
        })
      ).rejects.toThrow("Failed to create session");
    });
  });

  describe("findByToken", () => {
    test("returns session when found and not expired", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue({
        id: mockSession.id,
        user_id: mockSession.userId,
        token: mockSession.token,
        expires_at: mockSession.expiresAt.toISOString(),
        created_at: mockSession.createdAt.toISOString(),
      });

      const repo = new SessionRepository(db);
      const result = await repo.findByToken("token-abc");

      expect(result).toEqual(mockSession);
      expect(mocks.queryOne).toHaveBeenCalled();
    });

    test("returns null when session not found", async () => {
      const { db, mocks } = createMockDb();
      mocks.queryOne.mockResolvedValue(null);

      const repo = new SessionRepository(db);
      const result = await repo.findByToken("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("deleteByToken", () => {
    test("deletes session by token", async () => {
      const { db, mocks } = createMockDb();

      const repo = new SessionRepository(db);
      await repo.deleteByToken("token-abc");

      expect(mocks.execute).toHaveBeenCalled();
    });
  });

  describe("deleteExpired", () => {
    test("returns count of deleted sessions", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([{ count: 5 }]);

      const repo = new SessionRepository(db);
      const result = await repo.deleteExpired();

      expect(result).toBe(5);
      expect(mocks.query).toHaveBeenCalled();
    });

    test("returns 0 when no sessions deleted", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([{ count: 0 }]);

      const repo = new SessionRepository(db);
      const result = await repo.deleteExpired();

      expect(result).toBe(0);
    });

    test("returns 0 when query returns empty", async () => {
      const { db, mocks } = createMockDb();
      mocks.query.mockResolvedValue([]);

      const repo = new SessionRepository(db);
      const result = await repo.deleteExpired();

      expect(result).toBe(0);
    });
  });
});
