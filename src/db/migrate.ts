/**
 * Database Migration Runner
 *
 * Reads SQL migration files from src/db/migrations/ and applies them in order.
 * Tracks applied migrations in the schema_migrations table.
 *
 * Usage: bun run db:migrate
 */

import { SQL } from "bun";
import { Glob } from "bun";

interface MigrationRecord {
  version: number;
  applied_at: Date;
}

interface MigrationFile {
  version: number;
  filename: string;
  path: string;
}

function parseVersion(filename: string): number | null {
  // Extract version number from filename like "001_initial_schema.sql"
  const match = /^(\d+)_/.exec(filename);
  if (!match?.[1]) return null;
  return parseInt(match[1], 10);
}

async function getMigrationFiles(): Promise<MigrationFile[]> {
  const migrationsDir = new URL("./migrations", import.meta.url).pathname;
  const glob = new Glob("*.sql");
  const files: MigrationFile[] = [];

  for await (const filename of glob.scan(migrationsDir)) {
    const version = parseVersion(filename);
    if (version !== null) {
      files.push({
        version,
        filename,
        path: `${migrationsDir}/${filename}`,
      });
    }
  }

  // Sort by version number
  return files.sort((a, b) => a.version - b.version);
}

async function ensureMigrationsTable(sql: SQL): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(sql: SQL): Promise<Set<number>> {
  const results: MigrationRecord[] = await sql.unsafe(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return new Set(results.map((r) => r.version));
}

async function applyMigration(
  sql: SQL,
  migration: MigrationFile
): Promise<void> {
  const content = await Bun.file(migration.path).text();

  // Execute migration within a transaction
  await sql.begin(async (tx) => {
    // Run the migration SQL
    await tx.unsafe(content);

    // Record the migration (skip if version 1 since it creates the table)
    await tx.unsafe("INSERT INTO schema_migrations (version) VALUES ($1)", [
      migration.version,
    ]);
  });
}

export async function runMigrations(connectionString?: string): Promise<{
  applied: number[];
  skipped: number[];
}> {
  const dbUrl =
    connectionString ??
    process.env["DATABASE_URL"] ??
    "postgres://postgres:postgres@localhost:5432/aiskualerts";

  const sql = new SQL(dbUrl);
  const result = { applied: [] as number[], skipped: [] as number[] };

  try {
    // Ensure migrations table exists
    await ensureMigrationsTable(sql);

    // Get list of already applied migrations
    const appliedVersions = await getAppliedVersions(sql);

    // Get all migration files
    const migrations = await getMigrationFiles();

    if (migrations.length === 0) {
      console.info("No migration files found.");
      return result;
    }

    console.info(`Found ${String(migrations.length)} migration(s).`);

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        console.info(
          `  [SKIP] ${migration.filename} (already applied)`
        );
        result.skipped.push(migration.version);
        continue;
      }

      console.info(`  [APPLYING] ${migration.filename}...`);
      await applyMigration(sql, migration);
      console.info(`  [DONE] ${migration.filename}`);
      result.applied.push(migration.version);
    }

    if (result.applied.length === 0) {
      console.info("Database is up to date. No migrations applied.");
    } else {
      console.info(
        `Successfully applied ${String(result.applied.length)} migration(s).`
      );
    }

    return result;
  } finally {
    await sql.end();
  }
}

// Run migrations when executed directly
if (import.meta.main) {
  runMigrations()
    .then((result) => {
      if (result.applied.length > 0) {
        console.info("\nMigrations complete!");
      }
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
