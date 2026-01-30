import { test, expect, describe, mock } from "bun:test";
import {
  validateSchema,
  createValidateSchemaOrDie,
  type ValidationResult,
} from "@/db/validate";
import type { DatabaseClient } from "@/db/client";

/**
 * Unit tests for runtime schema validation
 *
 * These tests verify the validation logic without requiring a real database.
 * Integration tests with a real database are in tests/integration/db/validate.integration.test.ts
 */

describe("validateSchema", () => {
  function createMockDb(overrides: {
    query?: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  } = {}): DatabaseClient {
    return {
      query: overrides.query ?? (async () => []),
      queryOne: async () => null,
      execute: async () => {},
      transaction: async <T>(fn: () => Promise<T>) => fn(),
      close: async () => {},
    } as unknown as DatabaseClient;
  }

  describe("migration version validation", () => {
    test("passes when current version >= required version", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return [
              { tablename: "tenants" },
              { tablename: "users" },
              { tablename: "sessions" },
              { tablename: "stock_snapshots" },
              { tablename: "thresholds" },
              { tablename: "alerts" },
              { tablename: "magic_link_tokens" },
              { tablename: "user_tenants" },
              { tablename: "daily_consumption" },
              { tablename: "schema_migrations" },
            ];
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: "20240601000011" }];
          }
          return [];
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(true);
      expect(result.currentVersion).toBe("20240601000011");
      expect(result.errors).toHaveLength(0);
    });

    test("passes when current version > required version", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return [
              { tablename: "tenants" },
              { tablename: "users" },
              { tablename: "sessions" },
              { tablename: "stock_snapshots" },
              { tablename: "thresholds" },
              { tablename: "alerts" },
              { tablename: "magic_link_tokens" },
              { tablename: "user_tenants" },
              { tablename: "daily_consumption" },
              { tablename: "schema_migrations" },
            ];
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: "20250101000001" }]; // Future version
          }
          return [];
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(true);
      expect(result.currentVersion).toBe("20250101000001");
    });

    test("fails when current version < required version", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return [
              { tablename: "tenants" },
              { tablename: "users" },
              { tablename: "sessions" },
              { tablename: "stock_snapshots" },
              { tablename: "thresholds" },
              { tablename: "alerts" },
              { tablename: "magic_link_tokens" },
              { tablename: "user_tenants" },
              { tablename: "daily_consumption" },
              { tablename: "schema_migrations" },
            ];
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: "20240101000001" }]; // Old version
          }
          return [];
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(false);
      expect(result.currentVersion).toBe("20240101000001");
      expect(result.errors.some(e => e.includes("older than required"))).toBe(true);
    });

    test("fails when no migrations found", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return [];
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: null }];
          }
          return [];
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(false);
      expect(result.currentVersion).toBeNull();
      expect(result.errors.some(e => e.includes("No migrations found"))).toBe(true);
    });
  });

  describe("critical tables validation", () => {
    test("passes when all critical tables exist", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return [
              { tablename: "tenants" },
              { tablename: "users" },
              { tablename: "sessions" },
              { tablename: "stock_snapshots" },
              { tablename: "thresholds" },
              { tablename: "alerts" },
              { tablename: "magic_link_tokens" },
              { tablename: "user_tenants" },
              { tablename: "daily_consumption" },
              { tablename: "schema_migrations" },
            ];
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: "20240601000011" }];
          }
          return [];
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(true);
      expect(result.missingTables).toHaveLength(0);
    });

    test("fails when critical tables are missing", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return [
              { tablename: "tenants" },
              { tablename: "users" },
              // Missing: sessions, stock_snapshots, thresholds, alerts, etc.
            ];
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: "20240601000011" }];
          }
          return [];
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(false);
      expect(result.missingTables.length).toBeGreaterThan(0);
      expect(result.missingTables).toContain("sessions");
      expect(result.missingTables).toContain("stock_snapshots");
      expect(result.errors.some(e => e.includes("Missing critical tables"))).toBe(true);
    });

    test("reports all missing tables", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return []; // No tables at all
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: "20240601000011" }];
          }
          return [];
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(false);
      expect(result.missingTables).toContain("tenants");
      expect(result.missingTables).toContain("users");
      expect(result.missingTables).toContain("sessions");
      expect(result.missingTables).toContain("stock_snapshots");
      expect(result.missingTables).toContain("thresholds");
      expect(result.missingTables).toContain("alerts");
      expect(result.missingTables).toContain("magic_link_tokens");
      expect(result.missingTables).toContain("user_tenants");
      expect(result.missingTables).toContain("daily_consumption");
      expect(result.missingTables).toContain("schema_migrations");
    });
  });

  describe("error handling", () => {
    test("fails gracefully on database connection error", async () => {
      const db = createMockDb({
        query: async () => {
          throw new Error("Connection refused");
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes("Connection refused"))).toBe(true);
    });

    test("captures error message from database errors", async () => {
      const db = createMockDb({
        query: async () => {
          throw new Error("FATAL: database does not exist");
        },
      });

      const result = await validateSchema(db);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes("database does not exist"))).toBe(true);
    });
  });

  describe("ValidationResult structure", () => {
    test("returns complete result object", async () => {
      const db = createMockDb({
        query: async (sql: string) => {
          // Check pg_tables first since the IN clause contains 'schema_migrations'
          if (sql.includes("pg_tables")) {
            return [
              { tablename: "tenants" },
              { tablename: "users" },
              { tablename: "sessions" },
              { tablename: "stock_snapshots" },
              { tablename: "thresholds" },
              { tablename: "alerts" },
              { tablename: "magic_link_tokens" },
              { tablename: "user_tenants" },
              { tablename: "daily_consumption" },
              { tablename: "schema_migrations" },
            ];
          }
          if (sql.includes("schema_migrations")) {
            return [{ version: "20240601000011" }];
          }
          return [];
        },
      });

      const result: ValidationResult = await validateSchema(db);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("currentVersion");
      expect(result).toHaveProperty("requiredVersion");
      expect(result).toHaveProperty("missingTables");
      expect(result).toHaveProperty("errors");
      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.missingTables)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});

describe("createValidateSchemaOrDie", () => {
  function createMockDb(overrides: {
    query?: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  } = {}): DatabaseClient {
    return {
      query: overrides.query ?? (async () => []),
      queryOne: async () => null,
      execute: async () => {},
      transaction: async <T>(fn: () => Promise<T>) => fn(),
      close: async () => {},
    } as unknown as DatabaseClient;
  }

  test("does not call exit when validation passes", async () => {
    const exitFn = mock(() => {
      throw new Error("exit called");
    });

    const db = createMockDb({
      query: async (sql: string) => {
        // Check pg_tables first since the IN clause contains 'schema_migrations'
        if (sql.includes("pg_tables")) {
          return [
            { tablename: "tenants" },
            { tablename: "users" },
            { tablename: "sessions" },
            { tablename: "stock_snapshots" },
            { tablename: "thresholds" },
            { tablename: "alerts" },
            { tablename: "magic_link_tokens" },
            { tablename: "user_tenants" },
            { tablename: "daily_consumption" },
            { tablename: "schema_migrations" },
          ];
        }
        if (sql.includes("schema_migrations")) {
          return [{ version: "20240601000011" }];
        }
        return [];
      },
    });

    const validateSchemaOrDie = createValidateSchemaOrDie(exitFn as unknown as (code: number) => never);

    await validateSchemaOrDie(db);

    expect(exitFn).not.toHaveBeenCalled();
  });

  test("calls exit with code 1 when validation fails", async () => {
    let exitCalled = false;
    let exitCode = -1;

    const exitFn = ((code: number) => {
      exitCalled = true;
      exitCode = code;
      throw new Error("exit");
    }) as (code: number) => never;

    const db = createMockDb({
      query: async (sql: string) => {
        // Check pg_tables first since the IN clause contains 'schema_migrations'
        if (sql.includes("pg_tables")) {
          return [];
        }
        if (sql.includes("schema_migrations")) {
          return [{ version: "20240101000001" }]; // Old version
        }
        return [];
      },
    });

    const validateSchemaOrDie = createValidateSchemaOrDie(exitFn);

    try {
      await validateSchemaOrDie(db);
    } catch {
      // Expected - exit throws
    }

    expect(exitCalled).toBe(true);
    expect(exitCode).toBe(1);
  });
});
