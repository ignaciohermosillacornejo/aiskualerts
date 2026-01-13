import { SQL } from "bun";
import {
  traceDbQuery,
  traceDbTransaction,
  recordDistribution,
} from "@/monitoring/sentry";

/**
 * Extract the operation and table from a SQL query for tracing
 */
function parseQueryForTracing(query: string): { operation: string; table: string } {
  const trimmed = query.trim().toUpperCase();
  const words = trimmed.split(/\s+/);
  const operation = words[0] ?? "QUERY";

  // Try to extract table name based on operation
  let table = "unknown";
  if (operation === "SELECT") {
    const fromIndex = words.indexOf("FROM");
    const tableName = fromIndex !== -1 ? words[fromIndex + 1] : undefined;
    if (tableName) {
      table = tableName.toLowerCase().replace(/[^a-z_]/g, "");
    }
  } else if (operation === "INSERT") {
    const intoIndex = words.indexOf("INTO");
    const tableName = intoIndex !== -1 ? words[intoIndex + 1] : undefined;
    if (tableName) {
      table = tableName.toLowerCase().replace(/[^a-z_]/g, "");
    }
  } else if (operation === "UPDATE" || operation === "DELETE") {
    const tableName = words[1];
    if (tableName) {
      table = tableName.toLowerCase().replace(/[^a-z_]/g, "");
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
