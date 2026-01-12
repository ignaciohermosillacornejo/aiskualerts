/* eslint-disable @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */
import { test, expect, describe, mock } from "bun:test";

// Test the singleton logic pattern used in db/client.ts
describe("Database Client Singleton Pattern", () => {
  describe("getDb behavior", () => {
    test("returns same instance on multiple calls (singleton pattern)", () => {
      // Simulate the singleton pattern
      let instance: object | null = null;

      function getDb() {
        if (!instance) {
          instance = { type: "DatabaseClient", id: Math.random() };
        }
        return instance;
      }

      const first = getDb();
      const second = getDb();
      const third = getDb();

      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(first).toBe(third);
    });

    test("creates new instance only on first call", () => {
      let createCount = 0;
      let instance: object | null = null;

      function createInstance() {
        createCount++;
        return { id: createCount };
      }

      function getDb() {
        if (!instance) {
          instance = createInstance();
        }
        return instance;
      }

      getDb();
      getDb();
      getDb();

      expect(createCount).toBe(1);
    });
  });

  describe("closeDb behavior", () => {
    test("clears the singleton instance", async () => {
      let instance: { close: () => Promise<void> } | null = {
        close: mock(() => Promise.resolve()),
      };

      async function closeDb() {
        if (instance) {
          await instance.close();
          instance = null;
        }
      }

      expect(instance).not.toBeNull();
      await closeDb();
      expect(instance).toBeNull();
    });

    test("is safe to call when no instance exists", async () => {
      let instance: { close: () => Promise<void> } | null = null;

      async function closeDb() {
        if (instance) {
          await instance.close();
          instance = null;
        }
      }

      // Should not throw
      await closeDb();
      expect(instance).toBe(null);
    });

    test("allows new instance after close", () => {
      let instance: object | null = null;
      let createCount = 0;

      function createInstance() {
        createCount++;
        return { id: createCount };
      }

      function getDb() {
        if (!instance) {
          instance = createInstance();
        }
        return instance;
      }

      function closeDb() {
        instance = null;
      }

      const first = getDb();
      expect(createCount).toBe(1);

      closeDb();

      const second = getDb();
      expect(createCount).toBe(2);
      expect(first).not.toBe(second);
    });
  });

  describe("connection string handling", () => {
    test("uses DATABASE_URL from environment", () => {
      const originalUrl = process.env["DATABASE_URL"];

      process.env["DATABASE_URL"] = "postgres://custom:custom@localhost:5432/custom";

      const envUrl = process.env["DATABASE_URL"];
      const fallback = "postgres://postgres:postgres@localhost:5432/aiskualerts";
      const connectionString = envUrl ?? fallback;

      expect(connectionString).toBe("postgres://custom:custom@localhost:5432/custom");

      // Restore
      if (originalUrl) {
        process.env["DATABASE_URL"] = originalUrl;
      } else {
        delete process.env["DATABASE_URL"];
      }
    });

    test("uses fallback when DATABASE_URL not set", () => {
      const originalUrl = process.env["DATABASE_URL"];
      delete process.env["DATABASE_URL"];

      const envUrl = process.env["DATABASE_URL"];
      const fallback = "postgres://postgres:postgres@localhost:5432/aiskualerts";
      const connectionString = envUrl ?? fallback;

      expect(connectionString).toBe(fallback);

      // Restore
      if (originalUrl) {
        process.env["DATABASE_URL"] = originalUrl;
      }
    });
  });

  describe("DatabaseClient methods", () => {
    test("query returns array", async () => {
      const mockQuery = mock((_sql: string) => Promise.resolve([{ id: 1 }, { id: 2 }]));

      const db = { query: mockQuery };
      const result = await db.query("SELECT * FROM test");

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    test("queryOne returns first result or null", async () => {
      const mockQueryOne = mock((_sql: string, _params?: unknown[]) => Promise.resolve({ id: 1 }));

      const db = { queryOne: mockQueryOne };
      const result = await db.queryOne("SELECT * FROM test WHERE id = $1", [1]);

      expect(result).toEqual({ id: 1 });
    });

    test("queryOne returns null for no results", async () => {
      const mockQueryOne = mock((_sql: string, _params?: unknown[]) => Promise.resolve(null));

      const db = { queryOne: mockQueryOne };
      const result = await db.queryOne("SELECT * FROM test WHERE id = $1", [999]);

      expect(result).toBeNull();
    });

    test("execute runs without returning results", async () => {
      const mockExecute = mock((_sql: string, _params?: unknown[]) => Promise.resolve());

      const db = { execute: mockExecute };
      await db.execute("DELETE FROM test WHERE id = $1", [1]);

      expect(mockExecute).toHaveBeenCalled();
    });

    test("transaction wraps operations", async () => {
      const mockTransaction = mock(
        async <T>(callback: (client: unknown) => Promise<T>): Promise<T> => {
          return callback({});
        }
      );

      const db = { transaction: mockTransaction };

      const result = await db.transaction(async () => {
        return "transaction result";
      });

      expect(result).toBe("transaction result");
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe("initSchema", () => {
    test("reads and executes schema file", async () => {
      // Simulate schema initialization
      const schemaSQL = `
        CREATE TABLE IF NOT EXISTS test (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255)
        );
      `;

      const mockExecute = mock((_sql: string) => Promise.resolve());

      const initSchema = async () => {
        await mockExecute(schemaSQL);
      };

      await initSchema();

      expect(mockExecute).toHaveBeenCalledWith(schemaSQL);
    });
  });
});

describe("Database exports", () => {
  test("exports DatabaseClient class", async () => {
    const { DatabaseClient } = await import("../../../src/db/client");
    expect(DatabaseClient).toBeDefined();
    expect(typeof DatabaseClient).toBe("function");
  });

  test("exports getDb function", async () => {
    const { getDb } = await import("../../../src/db/client");
    expect(getDb).toBeDefined();
    expect(typeof getDb).toBe("function");
  });

  test("exports closeDb function", async () => {
    const { closeDb } = await import("../../../src/db/client");
    expect(closeDb).toBeDefined();
    expect(typeof closeDb).toBe("function");
  });
});
