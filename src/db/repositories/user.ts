import type { DatabaseClient } from "@/db/client";
import type { User } from "./types";

export interface CreateUserInput {
  tenant_id: string;
  email: string;
  name?: string;
  notification_enabled?: boolean;
  notification_email?: string;
}

export class UserRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreateUserInput): Promise<User> {
    const users = await this.db.query<User>(
      `INSERT INTO users (tenant_id, email, name, notification_enabled, notification_email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.tenant_id,
        input.email,
        input.name ?? null,
        input.notification_enabled ?? true,
        input.notification_email ?? null,
      ]
    );

    const user = users[0];
    if (!user) {
      throw new Error("Failed to create user");
    }

    return user;
  }

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

  async update(
    userId: string,
    input: Partial<Pick<User, "name" | "notification_enabled" | "notification_email">>
  ): Promise<User> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${String(paramCount++)}`);
      values.push(input.name);
    }

    if (input.notification_enabled !== undefined) {
      updates.push(`notification_enabled = $${String(paramCount++)}`);
      values.push(input.notification_enabled);
    }

    if (input.notification_email !== undefined) {
      updates.push(`notification_email = $${String(paramCount++)}`);
      values.push(input.notification_email);
    }

    if (updates.length === 0) {
      const user = await this.getById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      return user;
    }

    values.push(userId);

    const users = await this.db.query<User>(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${String(paramCount)} RETURNING *`,
      values
    );

    const user = users[0];
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return user;
  }
}
