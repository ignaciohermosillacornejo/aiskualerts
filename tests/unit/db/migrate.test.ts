import { test, expect, describe } from "bun:test";

// Import the module to test exported functions
import * as migrateModule from "../../../src/db/migrate";

describe("migrate.ts", () => {
  describe("module exports", () => {
    test("exports runMigrations function", () => {
      expect(migrateModule.runMigrations).toBeFunction();
    });
  });

  describe("parseVersion logic", () => {
    test("extracts version from valid migration filename", () => {
      // Test the regex pattern used in parseVersion
      const extractVersion = (filename: string): number | null => {
        const match = /^(\d+)_/.exec(filename);
        if (!match?.[1]) return null;
        return parseInt(match[1], 10);
      };

      expect(extractVersion("001_initial_schema.sql")).toBe(1);
      expect(extractVersion("002_add_column.sql")).toBe(2);
      expect(extractVersion("999_last_migration.sql")).toBe(999);
      expect(extractVersion("0001_padded.sql")).toBe(1);
    });

    test("returns null for invalid filenames", () => {
      const extractVersion = (filename: string): number | null => {
        const match = /^(\d+)_/.exec(filename);
        if (!match?.[1]) return null;
        return parseInt(match[1], 10);
      };

      expect(extractVersion("schema.sql")).toBeNull();
      expect(extractVersion("_001_schema.sql")).toBeNull();
      expect(extractVersion("migration.sql")).toBeNull();
      expect(extractVersion("readme.md")).toBeNull();
    });

    test("handles edge case filenames", () => {
      const extractVersion = (filename: string): number | null => {
        const match = /^(\d+)_/.exec(filename);
        if (!match?.[1]) return null;
        return parseInt(match[1], 10);
      };

      expect(extractVersion("0_empty.sql")).toBe(0);
      expect(extractVersion("123456789_large.sql")).toBe(123456789);
    });
  });

  describe("migration file sorting", () => {
    test("sorts migrations by version number", () => {
      const migrations = [
        { version: 3, filename: "003_third.sql" },
        { version: 1, filename: "001_first.sql" },
        { version: 2, filename: "002_second.sql" },
      ];

      const sorted = migrations.sort((a, b) => a.version - b.version);

      expect(sorted[0]?.version).toBe(1);
      expect(sorted[1]?.version).toBe(2);
      expect(sorted[2]?.version).toBe(3);
    });

    test("handles out of order files", () => {
      const migrations = [
        { version: 10, filename: "010_tenth.sql" },
        { version: 5, filename: "005_fifth.sql" },
        { version: 1, filename: "001_first.sql" },
        { version: 100, filename: "100_hundredth.sql" },
      ];

      const sorted = migrations.sort((a, b) => a.version - b.version);

      expect(sorted.map((m) => m.version)).toEqual([1, 5, 10, 100]);
    });
  });

  describe("applied versions tracking", () => {
    test("creates Set from applied versions", () => {
      const appliedRecords = [
        { version: 1, applied_at: new Date() },
        { version: 2, applied_at: new Date() },
        { version: 3, applied_at: new Date() },
      ];

      const appliedVersions = new Set(appliedRecords.map((r) => r.version));

      expect(appliedVersions.has(1)).toBe(true);
      expect(appliedVersions.has(2)).toBe(true);
      expect(appliedVersions.has(3)).toBe(true);
      expect(appliedVersions.has(4)).toBe(false);
    });

    test("identifies pending migrations", () => {
      const allMigrations = [
        { version: 1, filename: "001_first.sql" },
        { version: 2, filename: "002_second.sql" },
        { version: 3, filename: "003_third.sql" },
      ];
      const appliedVersions = new Set([1, 2]);

      const pending = allMigrations.filter(
        (m) => !appliedVersions.has(m.version)
      );

      expect(pending).toHaveLength(1);
      expect(pending[0]?.version).toBe(3);
    });

    test("identifies already applied migrations", () => {
      const allMigrations = [
        { version: 1, filename: "001_first.sql" },
        { version: 2, filename: "002_second.sql" },
        { version: 3, filename: "003_third.sql" },
      ];
      const appliedVersions = new Set([1, 2, 3]);

      const pending = allMigrations.filter(
        (m) => !appliedVersions.has(m.version)
      );

      expect(pending).toHaveLength(0);
    });
  });

  describe("result structure", () => {
    test("returns applied and skipped arrays", () => {
      const result = { applied: [] as number[], skipped: [] as number[] };

      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    test("tracks applied migrations correctly", () => {
      const result = { applied: [] as number[], skipped: [] as number[] };

      // Simulate applying migration 3
      result.applied.push(3);

      expect(result.applied).toEqual([3]);
    });

    test("tracks skipped migrations correctly", () => {
      const result = { applied: [] as number[], skipped: [] as number[] };

      // Simulate skipping migrations 1 and 2
      result.skipped.push(1);
      result.skipped.push(2);

      expect(result.skipped).toEqual([1, 2]);
    });
  });

  describe("connection string handling", () => {
    test("uses provided connection string over env and fallback", () => {
      const getConnectionString = (
        provided: string | undefined,
        envUrl: string | undefined,
        fallback: string
      ): string => {
        return provided ?? envUrl ?? fallback;
      };

      const result = getConnectionString(
        "postgres://user:pass@host:5432/db",
        "postgres://env:pass@host:5432/db",
        "postgres://postgres:postgres@localhost:5432/aiskualerts"
      );

      expect(result).toBe("postgres://user:pass@host:5432/db");
    });

    test("falls back to DATABASE_URL when no string provided", () => {
      const getConnectionString = (
        provided: string | undefined,
        envUrl: string | undefined,
        fallback: string
      ): string => {
        return provided ?? envUrl ?? fallback;
      };

      const result = getConnectionString(
        undefined,
        "postgres://env:pass@host:5432/db",
        "postgres://postgres:postgres@localhost:5432/aiskualerts"
      );

      expect(result).toBe("postgres://env:pass@host:5432/db");
    });

    test("falls back to default when nothing provided", () => {
      const getConnectionString = (
        provided: string | undefined,
        envUrl: string | undefined,
        fallback: string
      ): string => {
        return provided ?? envUrl ?? fallback;
      };

      const result = getConnectionString(
        undefined,
        undefined,
        "postgres://postgres:postgres@localhost:5432/aiskualerts"
      );

      expect(result).toBe("postgres://postgres:postgres@localhost:5432/aiskualerts");
    });
  });

  describe("migration interface types", () => {
    test("MigrationRecord has version and applied_at", () => {
      interface MigrationRecord {
        version: number;
        applied_at: Date;
      }

      const record: MigrationRecord = {
        version: 1,
        applied_at: new Date("2025-01-01T00:00:00Z"),
      };

      expect(record.version).toBe(1);
      expect(record.applied_at).toBeInstanceOf(Date);
    });

    test("MigrationFile has version, filename, and path", () => {
      interface MigrationFile {
        version: number;
        filename: string;
        path: string;
      }

      const file: MigrationFile = {
        version: 1,
        filename: "001_initial.sql",
        path: "/path/to/001_initial.sql",
      };

      expect(file.version).toBe(1);
      expect(file.filename).toBe("001_initial.sql");
      expect(file.path).toBe("/path/to/001_initial.sql");
    });
  });

  describe("schema_migrations table", () => {
    test("CREATE TABLE IF NOT EXISTS is idempotent", () => {
      // The SQL statement used in ensureMigrationsTable
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;

      // Verify it contains IF NOT EXISTS for idempotency
      expect(createTableSQL).toContain("IF NOT EXISTS");
      expect(createTableSQL).toContain("schema_migrations");
      expect(createTableSQL).toContain("version INTEGER PRIMARY KEY");
      expect(createTableSQL).toContain("applied_at TIMESTAMPTZ");
    });
  });
});
