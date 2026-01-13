import { SQL } from "bun";
import {
  traceDbQuery,
  traceDbTransaction,
  recordDistribution,
} from "@/monitoring/sentry";

/**
 * Extract the operation and table from a SQL query for tracing.
 * This is a best-effort parser for metrics/tracing purposes only.
 * It safely handles edge cases and returns sensible defaults.
 */
function parseQueryForTracing(query: string): { operation: string; table: string } {
  // Handle empty or invalid input
  if (!query || typeof query !== "string") {
    return { operation: "QUERY", table: "unknown" };
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { operation: "QUERY", table: "unknown" };
  }

  // Limit query length to prevent DoS with huge queries
  const limited = trimmed.slice(0, 1000).toUpperCase();
  const words = limited.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return { operation: "QUERY", table: "unknown" };
  }

  const operation = words[0] ?? "QUERY";

  // Sanitize and extract table name
  const sanitizeTableName = (name: string | undefined): string => {
    if (!name) return "unknown";
    // Handle schema.table format - take the table part
    const parts = name.split(".");
    const tablePart = parts[parts.length - 1] ?? name;
    // Only allow alphanumeric and underscores, limit length
    const sanitized = tablePart.toLowerCase().replace(/[^a-z0-9_]/g, "");
    return sanitized.slice(0, 64) || "unknown";
  };

  // Try to extract table name based on operation
  let table = "unknown";

  if (operation === "SELECT" || operation === "WITH") {
    // Handle CTEs: WITH ... SELECT ... FROM table
    // For simplicity, find the last FROM and use the next word
    const fromIndex = words.lastIndexOf("FROM");
    if (fromIndex !== -1 && fromIndex + 1 < words.length) {
      table = sanitizeTableName(words[fromIndex + 1]);
    }
  } else if (operation === "INSERT") {
    const intoIndex = words.indexOf("INTO");
    if (intoIndex !== -1 && intoIndex + 1 < words.length) {
      table = sanitizeTableName(words[intoIndex + 1]);
    }
  } else if (operation === "UPDATE") {
    if (words.length > 1) {
      table = sanitizeTableName(words[1]);
    }
  } else if (operation === "DELETE") {
    const fromIndex = words.indexOf("FROM");
    if (fromIndex !== -1 && fromIndex + 1 < words.length) {
      table = sanitizeTableName(words[fromIndex + 1]);
    } else if (words.length > 1) {
      // DELETE table_name WHERE ... (non-standard but handle it)
      table = sanitizeTableName(words[1]);
    }
  }

  return { operation, table };
}

export class DatabaseClient {
  private sql: SQL;

  constructor(connectionString: string) {
    this.sql = new SQL(connectionString);
  }

  async query<T = unknown>(
    query: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const { operation, table } = parseQueryForTracing(query);
    const startTime = Date.now();

    try {
      return await traceDbQuery(operation, table, async () => {
        const result: unknown = await this.sql.unsafe(query, params);
        return result as T[];
      });
    } finally {
      const duration = Date.now() - startTime;
      recordDistribution("db.query.duration", duration, "millisecond", {
        operation,
        table,
      });
    }
  }

  async queryOne<T = unknown>(
    query: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const results = await this.query<T>(query, params);
    return results[0] ?? null;
  }

  async execute(query: string, params: unknown[] = []): Promise<void> {
    const { operation, table } = parseQueryForTracing(query);
    const startTime = Date.now();

    try {
      await traceDbQuery(operation, table, async () => {
        await this.sql.unsafe(query, params);
      });
    } finally {
      const duration = Date.now() - startTime;
      recordDistribution("db.query.duration", duration, "millisecond", {
        operation,
        table,
      });
    }
  }

  async transaction<T>(
    callback: (client: DatabaseClient) => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();

    try {
      return await traceDbTransaction("db_transaction", async () => {
        return await this.sql.begin(async (tx) => {
          const txClient = new DatabaseClient("");
          txClient.sql = tx;
          return callback(txClient);
        });
      });
    } finally {
      const duration = Date.now() - startTime;
      recordDistribution("db.transaction.duration", duration, "millisecond");
    }
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  async initSchema(): Promise<void> {
    const schemaPath = new URL("./schema.sql", import.meta.url).pathname;
    const schema = await Bun.file(schemaPath).text();
    // Schema has no parameters, so we can execute multiple statements
    await this.sql.unsafe(schema);
  }
}

let dbInstance: DatabaseClient | null = null;

export function getDb(): DatabaseClient {
  if (!dbInstance) {
    const connectionString =
      process.env["DATABASE_URL"] ??
      "postgres://postgres:postgres@localhost:5432/aiskualerts";
    dbInstance = new DatabaseClient(connectionString);
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
