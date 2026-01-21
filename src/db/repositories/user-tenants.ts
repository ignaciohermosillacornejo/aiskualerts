import type { DatabaseClient } from "../client";
import type {
  UserTenant,
  UserTenantRole,
  UserTenantWithTenant,
  DigestFrequency,
} from "./types";

export interface CreateUserTenantInput {
  user_id: string;
  tenant_id: string;
  role?: UserTenantRole;
  notification_enabled?: boolean;
  notification_email?: string;
  digest_frequency?: DigestFrequency;
}

export interface UpdateNotificationSettingsInput {
  notification_enabled?: boolean;
  notification_email?: string | null;
  digest_frequency?: DigestFrequency;
}

export class UserTenantsRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreateUserTenantInput): Promise<UserTenant> {
    const results = await this.db.query<UserTenant>(
      `INSERT INTO user_tenants (user_id, tenant_id, role, notification_enabled, notification_email, digest_frequency)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.user_id,
        input.tenant_id,
        input.role ?? "member",
        input.notification_enabled ?? true,
        input.notification_email ?? null,
        input.digest_frequency ?? "daily",
      ]
    );
    const membership = results[0];
    if (!membership) {
      throw new Error("Failed to create user-tenant membership");
    }
    return membership;
  }

  async findByUserAndTenant(
    userId: string,
    tenantId: string
  ): Promise<UserTenant | null> {
    return this.db.queryOne<UserTenant>(
      `SELECT * FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }

  async getTenantsForUser(userId: string): Promise<UserTenantWithTenant[]> {
    return this.db.query<UserTenantWithTenant>(
      `SELECT ut.*, t.name as tenant_name, t.bsale_client_code, t.sync_status
       FROM user_tenants ut
       JOIN tenants t ON ut.tenant_id = t.id
       WHERE ut.user_id = $1
       ORDER BY ut.created_at ASC`,
      [userId]
    );
  }

  async getUsersForTenant(tenantId: string): Promise<UserTenant[]> {
    return this.db.query<UserTenant>(
      `SELECT * FROM user_tenants WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId]
    );
  }

  async updateRole(
    userId: string,
    tenantId: string,
    role: UserTenantRole
  ): Promise<UserTenant | null> {
    return this.db.queryOne<UserTenant>(
      `UPDATE user_tenants SET role = $3 WHERE user_id = $1 AND tenant_id = $2 RETURNING *`,
      [userId, tenantId, role]
    );
  }

  async updateNotificationSettings(
    userId: string,
    tenantId: string,
    settings: UpdateNotificationSettingsInput
  ): Promise<UserTenant | null> {
    const updates: string[] = [];
    const values: unknown[] = [userId, tenantId];
    let paramIndex = 3;

    if (settings.notification_enabled !== undefined) {
      updates.push(`notification_enabled = $${paramIndex++}`);
      values.push(settings.notification_enabled);
    }
    if (settings.notification_email !== undefined) {
      updates.push(`notification_email = $${paramIndex++}`);
      values.push(settings.notification_email);
    }
    if (settings.digest_frequency !== undefined) {
      updates.push(`digest_frequency = $${paramIndex++}`);
      values.push(settings.digest_frequency);
    }

    if (updates.length === 0) {
      return this.findByUserAndTenant(userId, tenantId);
    }

    return this.db.queryOne<UserTenant>(
      `UPDATE user_tenants SET ${updates.join(", ")} WHERE user_id = $1 AND tenant_id = $2 RETURNING *`,
      values
    );
  }

  async delete(userId: string, tenantId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }

  async hasAccess(userId: string, tenantId: string): Promise<boolean> {
    const result = await this.findByUserAndTenant(userId, tenantId);
    return result !== null;
  }

  async getRole(userId: string, tenantId: string): Promise<UserTenantRole | null> {
    const result = await this.db.queryOne<{ role: UserTenantRole }>(
      `SELECT role FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return result?.role ?? null;
  }
}
