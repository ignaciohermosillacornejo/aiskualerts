import { SQL } from "bun";

export class DatabaseClient {
  private sql: SQL;

  constructor(connectionString: string) {
    this.sql = new SQL(connectionString);
  }

  async query<T = unknown>(
    query: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result: unknown = await this.sql.unsafe(query, params);
    return result as T[];
  }

  async queryOne<T = unknown>(
    query: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const results = await this.query<T>(query, params);
    return results[0] ?? null;
  }

  async execute(query: string, params: unknown[] = []): Promise<void> {
    await this.sql.unsafe(query, params);
  }

  async transaction<T>(
    callback: (client: DatabaseClient) => Promise<T>
  ): Promise<T> {
    return await this.sql.begin(async (tx) => {
      const txClient = new DatabaseClient("");
      txClient.sql = tx;
      return callback(txClient);
    });
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
