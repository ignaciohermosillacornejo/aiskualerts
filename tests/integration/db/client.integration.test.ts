import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { DatabaseClient } from "@/db/client";
import {
  createTestDb,
  cleanDatabase,
  dropAllTables,
  createTestTenant,
  createTestUser,
  waitForDatabase,
} from "./helpers";

/**
 * Database Client Integration Tests
 *
 * Prerequisites:
 * - PostgreSQL test database running via docker-compose
 * - Run: docker-compose -f docker-compose.test.yml up -d
 *
 * These tests verify:
 * - Database connection
 * - Schema initialization
 * - CRUD operations
 * - Transactions
 * - Query helpers
 */

describe("DatabaseClient Integration Tests", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    // Wait for database to be ready (health check ensures PostgreSQL is running in CI)
    await waitForDatabase();

    db = createTestDb();

    // In CI, schema is initialized as a separate workflow step before tests
    // Locally, we need to initialize it here
    const isCI = process.env["CI"] === "true";
    if (!isCI) {
      await dropAllTables(db);
      await db.initSchema();
    }
  }, 30000); // 30s timeout - schema init is done separately in CI

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (db) {
      await db.close();
    }
  });

  beforeEach(async () => {
    // Clean tables before each test
    await cleanDatabase(db);
  }, 10000); // 10s timeout for cleanup

  describe("Connection & Setup", () => {
    test("should connect to test database", async () => {
      const result = await db.query<{ result: number }>("SELECT 1 as result");
      expect(result).toHaveLength(1);
      expect(result[0]?.result).toBe(1);
    });

    test("should have all required tables", async () => {
      const result = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
         ORDER BY tablename`
      );

      const tableNames = result.map((r) => r.tablename);
      expect(tableNames).toContain("tenants");
      expect(tableNames).toContain("users");
      expect(tableNames).toContain("stock_snapshots");
      expect(tableNames).toContain("thresholds");
      expect(tableNames).toContain("alerts");
      expect(tableNames).toContain("sessions");
    });

    test("should have correct indexes", async () => {
      const result = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
         AND indexname LIKE 'idx_%'
         ORDER BY indexname`
      );

      const indexNames = result.map((r) => r.indexname);
      expect(indexNames).toContain("idx_snapshots_tenant_date");
      expect(indexNames).toContain("idx_snapshots_variant");
      expect(indexNames).toContain("idx_thresholds_user");
      expect(indexNames).toContain("idx_alerts_user_status");
      expect(indexNames).toContain("idx_sessions_token");
    });
  });

  describe("Tenant Operations", () => {
    test("should create a tenant", async () => {
      const result = await db.queryOne<{ id: string }>(
        `INSERT INTO tenants (bsale_client_code, bsale_client_name, bsale_access_token)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ["12345678-9", "Test Company", "test-token"]
      );

      expect(result).toBeDefined();
      expect(result?.id).toBeDefined();
      expect(typeof result?.id).toBe("string");
    });

    test("should retrieve a tenant by id", async () => {
      const tenant = await createTestTenant(db);

      const result = await db.queryOne<{
        id: string;
        bsale_client_code: string;
        bsale_client_name: string;
      }>(
        `SELECT id, bsale_client_code, bsale_client_name
         FROM tenants
         WHERE id = $1`,
        [tenant.id]
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(tenant.id);
      expect(result?.bsale_client_code).toBe("12345678-9");
      expect(result?.bsale_client_name).toBe("Test Company");
    });

    test("should enforce unique bsale_client_code", async () => {
      await createTestTenant(db, { bsale_client_code: "12345678-9" });

      let errorThrown = false;
      try {
        await createTestTenant(db, { bsale_client_code: "12345678-9" });
      } catch {
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
    });

    test("should update tenant sync status", async () => {
      const tenant = await createTestTenant(db);

      await db.execute(
        `UPDATE tenants
         SET sync_status = $1, last_sync_at = NOW()
         WHERE id = $2`,
        ["success", tenant.id]
      );

      const result = await db.queryOne<{
        sync_status: string;
        last_sync_at: Date;
      }>(
        `SELECT sync_status, last_sync_at
         FROM tenants
         WHERE id = $1`,
        [tenant.id]
      );

      expect(result?.sync_status).toBe("success");
      expect(result?.last_sync_at).toBeInstanceOf(Date);
    });
  });

  describe("User Operations", () => {
    test("should create a user", async () => {
      const tenant = await createTestTenant(db);
      const user = await createTestUser(db, tenant.id);

      expect(user.id).toBeDefined();
    });

    test("should retrieve users by tenant", async () => {
      const tenant = await createTestTenant(db);
      await createTestUser(db, tenant.id, { email: "user1@example.com" });
      await createTestUser(db, tenant.id, { email: "user2@example.com" });

      const users = await db.query<{ email: string }>(
        `SELECT email FROM users
         WHERE tenant_id = $1
         ORDER BY email`,
        [tenant.id]
      );

      expect(users).toHaveLength(2);
      expect(users[0]?.email).toBe("user1@example.com");
      expect(users[1]?.email).toBe("user2@example.com");
    });

    test("should enforce unique email per tenant", async () => {
      const tenant = await createTestTenant(db);
      await createTestUser(db, tenant.id, { email: "test@example.com" });

      let errorThrown = false;
      try {
        await createTestUser(db, tenant.id, { email: "test@example.com" });
      } catch {
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
    });

    test("should allow same email across different tenants", async () => {
      const tenant1 = await createTestTenant(db, {
        bsale_client_code: "11111111-1",
      });
      const tenant2 = await createTestTenant(db, {
        bsale_client_code: "22222222-2",
      });

      await createTestUser(db, tenant1.id, { email: "test@example.com" });
      await createTestUser(db, tenant2.id, { email: "test@example.com" });

      const users = await db.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM users WHERE email = $1`,
        ["test@example.com"]
      );

      expect(users).toHaveLength(2);
    });

    test("should cascade delete users when tenant is deleted", async () => {
      const tenant = await createTestTenant(db);
      await createTestUser(db, tenant.id);

      await db.execute(`DELETE FROM tenants WHERE id = $1`, [tenant.id]);

      const users = await db.query(
        `SELECT * FROM users WHERE tenant_id = $1`,
        [tenant.id]
      );

      expect(users).toHaveLength(0);
    });
  });

  describe("Stock Snapshot Operations", () => {
    test("should create stock snapshot", async () => {
      const tenant = await createTestTenant(db);

      const result = await db.queryOne<{ id: string }>(
        `INSERT INTO stock_snapshots (
          tenant_id, bsale_variant_id, bsale_office_id,
          sku, product_name, quantity, quantity_reserved,
          quantity_available, snapshot_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          tenant.id,
          123,
          1,
          "SKU-001",
          "Test Product",
          100,
          5,
          95,
          "2025-01-01",
        ]
      );

      expect(result?.id).toBeDefined();
    });

    test("should enforce unique snapshot per variant/office/date", async () => {
      const tenant = await createTestTenant(db);

      await db.execute(
        `INSERT INTO stock_snapshots (
          tenant_id, bsale_variant_id, bsale_office_id,
          quantity, quantity_available, snapshot_date
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenant.id, 123, 1, 100, 100, "2025-01-01"]
      );

      let errorThrown = false;
      try {
        await db.execute(
          `INSERT INTO stock_snapshots (
            tenant_id, bsale_variant_id, bsale_office_id,
            quantity, quantity_available, snapshot_date
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenant.id, 123, 1, 50, 50, "2025-01-01"]
        );
      } catch {
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
    });

    test("should allow null bsale_office_id", async () => {
      const tenant = await createTestTenant(db);

      const result = await db.queryOne<{ bsale_office_id: number | null }>(
        `INSERT INTO stock_snapshots (
          tenant_id, bsale_variant_id, bsale_office_id,
          quantity, quantity_available, snapshot_date
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING bsale_office_id`,
        [tenant.id, 123, null, 100, 100, "2025-01-01"]
      );

      expect(result?.bsale_office_id).toBeNull();
    });

    test("should query snapshots by date", async () => {
      const tenant = await createTestTenant(db);
      const today = "2025-01-15";
      const yesterday = "2025-01-14";

      await db.execute(
        `INSERT INTO stock_snapshots (
          tenant_id, bsale_variant_id, quantity,
          quantity_available, snapshot_date
        ) VALUES ($1, $2, $3, $4, $5)`,
        [tenant.id, 123, 100, 100, today]
      );

      await db.execute(
        `INSERT INTO stock_snapshots (
          tenant_id, bsale_variant_id, quantity,
          quantity_available, snapshot_date
        ) VALUES ($1, $2, $3, $4, $5)`,
        [tenant.id, 124, 50, 50, yesterday]
      );

      const todaySnapshots = await db.query<{ bsale_variant_id: number }>(
        `SELECT bsale_variant_id FROM stock_snapshots
         WHERE tenant_id = $1 AND snapshot_date = $2`,
        [tenant.id, today]
      );

      expect(todaySnapshots).toHaveLength(1);
      expect(todaySnapshots[0]?.bsale_variant_id).toBe(123);
    });
  });

  describe("Threshold Operations", () => {
    test("should create threshold for specific variant", async () => {
      const tenant = await createTestTenant(db);
      const user = await createTestUser(db, tenant.id);

      const result = await db.queryOne<{ id: string }>(
        `INSERT INTO thresholds (
          tenant_id, user_id, bsale_variant_id,
          min_quantity, days_warning
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [tenant.id, user.id, 123, 10, 7]
      );

      expect(result?.id).toBeDefined();
    });

    test("should allow default threshold with null variant_id", async () => {
      const tenant = await createTestTenant(db);
      const user = await createTestUser(db, tenant.id);

      const result = await db.queryOne<{
        id: string;
        bsale_variant_id: number | null;
      }>(
        `INSERT INTO thresholds (
          tenant_id, user_id, bsale_variant_id,
          min_quantity
        ) VALUES ($1, $2, $3, $4)
        RETURNING id, bsale_variant_id`,
        [tenant.id, user.id, null, 10]
      );

      expect(result?.id).toBeDefined();
      expect(result?.bsale_variant_id).toBeNull();
    });

    test("should enforce unique threshold per user/variant/office", async () => {
      const tenant = await createTestTenant(db);
      const user = await createTestUser(db, tenant.id);

      await db.execute(
        `INSERT INTO thresholds (
          tenant_id, user_id, bsale_variant_id,
          bsale_office_id, min_quantity
        ) VALUES ($1, $2, $3, $4, $5)`,
        [tenant.id, user.id, 123, 1, 10]
      );

      let errorThrown = false;
      try {
        await db.execute(
          `INSERT INTO thresholds (
            tenant_id, user_id, bsale_variant_id,
            bsale_office_id, min_quantity
          ) VALUES ($1, $2, $3, $4, $5)`,
          [tenant.id, user.id, 123, 1, 20]
        );
      } catch {
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe("Alert Operations", () => {
    test("should create alert", async () => {
      const tenant = await createTestTenant(db);
      const user = await createTestUser(db, tenant.id);

      const result = await db.queryOne<{ id: string }>(
        `INSERT INTO alerts (
          tenant_id, user_id, bsale_variant_id,
          sku, product_name, alert_type,
          current_quantity, threshold_quantity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          tenant.id,
          user.id,
          123,
          "SKU-001",
          "Test Product",
          "threshold_breach",
          5,
          10,
        ]
      );

      expect(result?.id).toBeDefined();
    });

    test("should query pending alerts for user", async () => {
      const tenant = await createTestTenant(db);
      const user = await createTestUser(db, tenant.id);

      await db.execute(
        `INSERT INTO alerts (
          tenant_id, user_id, bsale_variant_id,
          alert_type, current_quantity, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenant.id, user.id, 123, "threshold_breach", 5, "pending"]
      );

      await db.execute(
        `INSERT INTO alerts (
          tenant_id, user_id, bsale_variant_id,
          alert_type, current_quantity, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenant.id, user.id, 124, "threshold_breach", 3, "sent"]
      );

      const pendingAlerts = await db.query<{ status: string }>(
        `SELECT status FROM alerts
         WHERE user_id = $1 AND status = $2`,
        [user.id, "pending"]
      );

      expect(pendingAlerts).toHaveLength(1);
    });

    test("should update alert status", async () => {
      const tenant = await createTestTenant(db);
      const user = await createTestUser(db, tenant.id);

      const alert = await db.queryOne<{ id: string }>(
        `INSERT INTO alerts (
          tenant_id, user_id, bsale_variant_id,
          alert_type, current_quantity, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [tenant.id, user.id, 123, "threshold_breach", 5, "pending"]
      );

      await db.execute(
        `UPDATE alerts SET status = $1, sent_at = NOW() WHERE id = $2`,
        ["sent", alert?.id]
      );

      const updated = await db.queryOne<{ status: string; sent_at: Date }>(
        `SELECT status, sent_at FROM alerts WHERE id = $1`,
        [alert?.id]
      );

      expect(updated?.status).toBe("sent");
      expect(updated?.sent_at).toBeInstanceOf(Date);
    });
  });

  describe("Transaction Support", () => {
    test("should commit transaction on success", async () => {
      const tenant = await createTestTenant(db);

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE tenants SET sync_status = $1 WHERE id = $2`,
          ["syncing", tenant.id]
        );
        await tx.execute(
          `UPDATE tenants SET sync_status = $1 WHERE id = $2`,
          ["success", tenant.id]
        );
      });

      const result = await db.queryOne<{ sync_status: string }>(
        `SELECT sync_status FROM tenants WHERE id = $1`,
        [tenant.id]
      );

      expect(result?.sync_status).toBe("success");
    });

    test("should rollback transaction on error", async () => {
      const tenant = await createTestTenant(db);

      let errorThrown = false;
      try {
        await db.transaction(async (tx) => {
          await tx.execute(
            `UPDATE tenants SET sync_status = $1 WHERE id = $2`,
            ["syncing", tenant.id]
          );
          throw new Error("Test error");
        });
      } catch {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);

      const result = await db.queryOne<{ sync_status: string }>(
        `SELECT sync_status FROM tenants WHERE id = $1`,
        [tenant.id]
      );

      // Should still be 'pending' (not 'syncing')
      expect(result?.sync_status).toBe("pending");
    });

    test("should isolate transaction from main connection", async () => {
      const tenant = await createTestTenant(db);

      // Start a transaction that we'll keep open
      const transactionPromise = db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE tenants SET sync_status = $1 WHERE id = $2`,
          ["syncing", tenant.id]
        );

        // Meanwhile, main connection should still see old value
        const mainResult = await db.queryOne<{ sync_status: string }>(
          `SELECT sync_status FROM tenants WHERE id = $1`,
          [tenant.id]
        );
        expect(mainResult?.sync_status).toBe("pending");

        // Complete the transaction
        await tx.execute(
          `UPDATE tenants SET sync_status = $1 WHERE id = $2`,
          ["success", tenant.id]
        );
      });

      await transactionPromise;

      // After transaction commits, main connection should see new value
      const finalResult = await db.queryOne<{ sync_status: string }>(
        `SELECT sync_status FROM tenants WHERE id = $1`,
        [tenant.id]
      );
      expect(finalResult?.sync_status).toBe("success");
    });
  });

  describe("Query Helpers", () => {
    test("query() should return array", async () => {
      const tenant = await createTestTenant(db);

      const result = await db.query<{ id: string }>(
        `SELECT id FROM tenants WHERE id = $1`,
        [tenant.id]
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    test("queryOne() should return single row", async () => {
      const tenant = await createTestTenant(db);

      const result = await db.queryOne<{ id: string }>(
        `SELECT id FROM tenants WHERE id = $1`,
        [tenant.id]
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(tenant.id);
    });

    test("queryOne() should return null when no rows", async () => {
      const result = await db.queryOne<{ id: string }>(
        `SELECT id FROM tenants WHERE id = $1`,
        ["00000000-0000-0000-0000-000000000000"]
      );

      expect(result).toBeNull();
    });

    test("execute() should not return data", async () => {
      const tenant = await createTestTenant(db);

      await db.execute(
        `UPDATE tenants SET sync_status = $1 WHERE id = $2`,
        ["success", tenant.id]
      );

      // Verify execution succeeded by querying the result
      const result = await db.queryOne<{ sync_status: string }>(
        `SELECT sync_status FROM tenants WHERE id = $1`,
        [tenant.id]
      );
      expect(result?.sync_status).toBe("success");
    });
  });
});
