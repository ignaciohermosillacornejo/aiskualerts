/**
 * Runtime Schema Validation
 *
 * Defense-in-depth validation that runs at application startup.
 * Ensures the database schema matches expected state before serving traffic.
 *
 * This is the final safety net - even if Docker Compose ordering fails,
 * the application will refuse to start with an incorrect schema.
 */

import { type DatabaseClient } from "./client";
import { logger } from "@/utils/logger";

/**
 * Required migration version (dbmate timestamp format)
 * Update this when adding new migrations that are required for the app to function
 */
const REQUIRED_MIGRATION = "20240601000011";

/**
 * Critical tables that must exist for the application to function
 */
const CRITICAL_TABLES = [
  "tenants",
  "users",
  "sessions",
  "stock_snapshots",
  "thresholds",
  "alerts",
  "magic_link_tokens",
  "user_tenants",
  "daily_consumption",
  "schema_migrations",
] as const;

interface MigrationRow {
  version: string;
}

interface TableRow {
  tablename: string;
}

export interface ValidationResult {
  success: boolean;
  currentVersion: string | null;
  requiredVersion: string;
  missingTables: string[];
  errors: string[];
}

/**
 * Validates the database schema matches expected state.
 * Returns validation result without exiting the process.
 */
export async function validateSchema(
  db: DatabaseClient
): Promise<ValidationResult> {
  const result: ValidationResult = {
    success: true,
    currentVersion: null,
    requiredVersion: REQUIRED_MIGRATION,
    missingTables: [],
    errors: [],
  };

  try {
    // Check migration version (fast: single row lookup using MAX)
    const migrations = await db.query<MigrationRow>(
      `SELECT MAX(version) as version FROM schema_migrations`
    );
    const currentVersion = migrations[0]?.version ?? null;
    result.currentVersion = currentVersion;

    if (!currentVersion) {
      result.success = false;
      result.errors.push("No migrations found in schema_migrations table");
    } else if (currentVersion < REQUIRED_MIGRATION) {
      result.success = false;
      result.errors.push(
        `Schema version ${currentVersion} is older than required ${REQUIRED_MIGRATION}`
      );
    }

    // Check critical tables exist (fast: system catalog query)
    const tables = await db.query<TableRow>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
       AND tablename = ANY($1)`,
      [CRITICAL_TABLES as unknown as string[]]
    );

    const foundTables = new Set(tables.map((t) => t.tablename));
    const missingTables = CRITICAL_TABLES.filter((t) => !foundTables.has(t));

    if (missingTables.length > 0) {
      result.success = false;
      result.missingTables = missingTables;
      result.errors.push(`Missing critical tables: ${missingTables.join(", ")}`);
    }
  } catch (error) {
    result.success = false;
    result.errors.push(
      `Database connection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return result;
}

/**
 * Validates schema and exits process with code 1 if validation fails.
 * Use this at application startup before accepting connections.
 */
export async function validateSchemaOrDie(db: DatabaseClient): Promise<void> {
  logger.info("Validating database schema...");

  const result = await validateSchema(db);

  if (!result.success) {
    for (const error of result.errors) {
      logger.error("Schema validation failed", new Error(error));
    }

    logger.error(
      "Application cannot start due to schema validation failure",
      new Error("Schema validation failed")
    );

    // Exit with error code to signal deployment failure
    process.exit(1);
  }

  logger.info("Schema validation passed", {
    currentVersion: result.currentVersion,
    requiredVersion: result.requiredVersion,
  });
}

/**
 * Creates a validateSchemaOrDie function with custom exit behavior for testing
 */
export function createValidateSchemaOrDie(
  exitFn: (code: number) => never = (code) => process.exit(code)
): (db: DatabaseClient) => Promise<void> {
  return async (db: DatabaseClient): Promise<void> => {
    logger.info("Validating database schema...");

    const result = await validateSchema(db);

    if (!result.success) {
      for (const error of result.errors) {
        logger.error("Schema validation failed", new Error(error));
      }

      logger.error(
        "Application cannot start due to schema validation failure",
        new Error("Schema validation failed")
      );

      exitFn(1);
    }

    logger.info("Schema validation passed", {
      currentVersion: result.currentVersion,
      requiredVersion: result.requiredVersion,
    });
  };
}
