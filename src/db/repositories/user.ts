import type { DatabaseClient } from "@/db/client";
import type { User } from "./types";

export class UserRepository {
  constructor(private db: DatabaseClient) {}

  async getByTenant(tenantId: string): Promise<User[]> {
    return this.db.query<User>(
      `SELECT * FROM users WHERE tenant_id = $1`,
      [tenantId]
    );
  }

  async getById(userId: string): Promise<User | null> {
    return this.db.queryOne<User>(
      `SELECT * FROM users WHERE id = $1`,
      [userId]
    );
  }

  async getByEmail(tenantId: string, email: string): Promise<User | null> {
    return this.db.queryOne<User>(
      `SELECT * FROM users WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email]
    );
  }

  async getWithNotificationsEnabled(tenantId: string): Promise<User[]> {
    return this.db.query<User>(
      `SELECT * FROM users WHERE tenant_id = $1 AND notification_enabled = true`,
      [tenantId]
    );
  }
}
