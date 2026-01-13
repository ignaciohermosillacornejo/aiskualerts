import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { DatabaseClient } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { createTestDb, dropAllTables, waitForDatabase, TEST_DB_URL } from "./helpers";

/**
 * Migration Runner Integration Tests
 *
 * Prerequisites:
 * - PostgreSQL test database running via docker-compose
 * - Run: docker-compose -f docker-compose.test.yml up -d
 *
 * These tests verify:
 * - Migration runner applies pending migrations
 * - Migrations are tracked in schema_migrations table
 * - Re-running migrations skips already applied ones
 * - Migrations run in correct order
 */

describe("Migration Runner Integration Tests", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    await waitForDatabase();
    db = createTestDb();
  }, 30000);

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (db) {
      await db.close();
    }
  });

  beforeEach(async () => {
    // Drop all tables to start fresh for each test
    await dropAllTables(db);
  }, 10000);

  describe("Fresh Database Migration", () => {
    test("should apply all migrations on empty database", async () => {
      const result = await runMigrations(TEST_DB_URL);

      // Should have applied at least the initial migration
      expect(result.applied.length).toBeGreaterThan(0);
      expect(result.applied).toContain(1); // 001_initial_schema.sql
      expect(result.skipped).toHaveLength(0);
    });

    test("should create schema_migrations table", async () => {
      await runMigrations(TEST_DB_URL);

      const tables = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'schema_migrations'`
      );

      expect(tables).toHaveLength(1);
      expect(tables[0]?.tablename).toBe("schema_migrations");
    });

    test("should record applied migrations in schema_migrations", async () => {
      await runMigrations(TEST_DB_URL);

      const migrations = await db.query<{ version: number; applied_at: Date }>(
        `SELECT version, applied_at FROM schema_migrations ORDER BY version`
      );

      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations[0]?.version).toBe(1);
      expect(migrations[0]?.applied_at).toBeInstanceOf(Date);
    });

    test("should create all application tables", async () => {
      await runMigrations(TEST_DB_URL);

      const tables = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
         ORDER BY tablename`
      );

      const tableNames = tables.map((t) => t.tablename);

      expect(tableNames).toContain("tenants");
      expect(tableNames).toContain("users");
      expect(tableNames).toContain("stock_snapshots");
      expect(tableNames).toContain("thresholds");
      expect(tableNames).toContain("alerts");
      expect(tableNames).toContain("sessions");
      expect(tableNames).toContain("schema_migrations");
    });

    test("should create all indexes", async () => {
      await runMigrations(TEST_DB_URL);

      const indexes = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
         AND indexname LIKE 'idx_%'
         ORDER BY indexname`
      );

      const indexNames = indexes.map((i) => i.indexname);

      expect(indexNames).toContain("idx_snapshots_tenant_date");
      expect(indexNames).toContain("idx_snapshots_variant");
      expect(indexNames).toContain("idx_thresholds_user");
      expect(indexNames).toContain("idx_alerts_user_status");
      expect(indexNames).toContain("idx_sessions_token");
    });
  });

  describe("Re-running Migrations", () => {
    test("should skip already applied migrations", async () => {
      // First run
      const firstRun = await runMigrations(TEST_DB_URL);
      expect(firstRun.applied.length).toBeGreaterThan(0);

      // Second run - should skip all
      const secondRun = await runMigrations(TEST_DB_URL);
      expect(secondRun.applied).toHaveLength(0);
      expect(secondRun.skipped.length).toBe(firstRun.applied.length);
    });

    test("should not duplicate entries in schema_migrations", async () => {
      await runMigrations(TEST_DB_URL);
      await runMigrations(TEST_DB_URL);

      const migrations = await db.query<{ version: number }>(
        `SELECT version FROM schema_migrations WHERE version = 1`
      );

      expect(migrations).toHaveLength(1);
    });
  });

  describe("Migration Order", () => {
    test("should apply migrations in version order", async () => {
      await runMigrations(TEST_DB_URL);

      const migrations = await db.query<{ version: number }>(
        `SELECT version FROM schema_migrations ORDER BY version`
      );

      // Verify versions are in ascending order
      for (let i = 1; i < migrations.length; i++) {
        const prev = migrations[i - 1]?.version ?? 0;
        // eslint-disable-next-line security/detect-object-injection -- index is bounds-checked
        const curr = migrations[i]?.version ?? 0;
        expect(curr).toBeGreaterThan(prev);
      }
    });
  });

  describe("Database Functionality After Migration", () => {
    test("should allow creating tenants after migration", async () => {
      await runMigrations(TEST_DB_URL);

      const tenant = await db.queryOne<{ id: string }>(
        `INSERT INTO tenants (bsale_client_code, bsale_client_name, bsale_access_token)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ["12345678-9", "Test Company", "test-token"]
      );

      expect(tenant).toBeDefined();
      expect(tenant?.id).toBeDefined();
    });

    test("should enforce foreign key constraints after migration", async () => {
      await runMigrations(TEST_DB_URL);

      // Try to create a user without a valid tenant
      let errorThrown = false;
      try {
        await db.execute(
          `INSERT INTO users (tenant_id, email)
           VALUES ($1, $2)`,
          ["00000000-0000-0000-0000-000000000000", "test@example.com"]
        );
      } catch {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);
    });

    test("should enforce unique constraints after migration", async () => {
      await runMigrations(TEST_DB_URL);

      await db.execute(
        `INSERT INTO tenants (bsale_client_code, bsale_client_name, bsale_access_token)
         VALUES ($1, $2, $3)`,
        ["12345678-9", "Test Company", "test-token"]
      );

      let errorThrown = false;
      try {
        await db.execute(
          `INSERT INTO tenants (bsale_client_code, bsale_client_name, bsale_access_token)
           VALUES ($1, $2, $3)`,
          ["12345678-9", "Duplicate Company", "another-token"]
        );
      } catch {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);
    });
  });

  describe("Connection String Handling", () => {
    test("should use provided connection string", async () => {
      // This should work with our test DB URL
      const result = await runMigrations(TEST_DB_URL);

      expect(result).toBeDefined();
      expect(result.applied).toBeDefined();
      expect(result.skipped).toBeDefined();
    });
  });
});
