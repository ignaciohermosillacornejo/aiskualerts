import { DatabaseClient } from "@/db/client";

/**
 * Test database helper utilities
 */

export const TEST_DB_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://test:test@localhost:5433/aiskualerts_test";

/**
 * Create a fresh database client for testing
 */
export function createTestDb(): DatabaseClient {
  return new DatabaseClient(TEST_DB_URL);
}

/**
 * Clean all tables in the database (in correct order to respect foreign keys)
 */
export async function cleanDatabase(db: DatabaseClient): Promise<void> {
  await db.execute("TRUNCATE TABLE sessions CASCADE");
  await db.execute("TRUNCATE TABLE alerts CASCADE");
  await db.execute("TRUNCATE TABLE thresholds CASCADE");
  await db.execute("TRUNCATE TABLE stock_snapshots CASCADE");
  await db.execute("TRUNCATE TABLE users CASCADE");
  await db.execute("TRUNCATE TABLE tenants CASCADE");
}

/**
 * Drop all tables (for schema migration tests)
 */
export async function dropAllTables(db: DatabaseClient): Promise<void> {
  await db.execute("DROP TABLE IF EXISTS sessions CASCADE");
  await db.execute("DROP TABLE IF EXISTS alerts CASCADE");
  await db.execute("DROP TABLE IF EXISTS thresholds CASCADE");
  await db.execute("DROP TABLE IF EXISTS stock_snapshots CASCADE");
  await db.execute("DROP TABLE IF EXISTS users CASCADE");
  await db.execute("DROP TABLE IF EXISTS tenants CASCADE");
}

/**
 * Create a test tenant
 */
export async function createTestTenant(
  db: DatabaseClient,
  overrides?: Partial<{
    bsale_client_code: string;
    bsale_client_name: string;
    bsale_access_token: string;
  }>
): Promise<{ id: string }> {
  const result = await db.queryOne<{ id: string }>(
    `INSERT INTO tenants (bsale_client_code, bsale_client_name, bsale_access_token)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      overrides?.bsale_client_code ?? "12345678-9",
      overrides?.bsale_client_name ?? "Test Company",
      overrides?.bsale_access_token ?? "test-token-123",
    ]
  );
  if (!result) throw new Error("Failed to create test tenant");
  return result;
}

/**
 * Create a test user
 */
export async function createTestUser(
  db: DatabaseClient,
  tenantId: string,
  overrides?: Partial<{
    email: string;
    name: string;
    notification_enabled: boolean;
  }>
): Promise<{ id: string }> {
  const result = await db.queryOne<{ id: string }>(
    `INSERT INTO users (tenant_id, email, name, notification_enabled)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      tenantId,
      overrides?.email ?? "test@example.com",
      overrides?.name ?? "Test User",
      overrides?.notification_enabled ?? true,
    ]
  );
  if (!result) throw new Error("Failed to create test user");
  return result;
}

/**
 * Wait for database to be ready
 * In CI, the GitHub Actions service health check ensures PostgreSQL is running.
 * This function handles the final connection initialization which may need a few retries.
 */
export async function waitForDatabase(
  maxRetries = 50,
  delayMs = 500
): Promise<void> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const db = createTestDb();
      // Test with a simple query
      await db.query("SELECT 1 as connection_test");
      await db.close();

      if (i > 0) {
        console.log(`✅ Database ready after ${i + 1} attempt(s)`);
      }
      return;
    } catch (error) {
      lastError = error;

      // Only log periodically to avoid spam
      if (i === 0 || i % 10 === 9) {
        console.log(`⏳ Waiting for database connection... (attempt ${i + 1}/${maxRetries})`);
      }

      if (i === maxRetries - 1) {
        console.error(`\n❌ Database connection failed after ${maxRetries} retries`);
        console.error(`Connection string: ${TEST_DB_URL}`);
        console.error(`Last error:`, lastError);
        throw new Error(
          "Database not ready. In CI, check service health. Locally, run: docker compose -f docker-compose.test.yml up -d"
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
