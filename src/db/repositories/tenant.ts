import type { DatabaseClient } from "@/db/client";
import type { Tenant, SyncStatus } from "./types";

export class TenantRepository {
  constructor(private db: DatabaseClient) {}

  async getActiveTenants(): Promise<Tenant[]> {
    return this.db.query<Tenant>(
      `SELECT * FROM tenants
       WHERE sync_status != 'syncing'
       ORDER BY last_sync_at ASC NULLS FIRST`
    );
  }

  async getById(id: string): Promise<Tenant | null> {
    return this.db.queryOne<Tenant>(
      `SELECT * FROM tenants WHERE id = $1`,
      [id]
    );
  }

  async updateSyncStatus(
    id: string,
    status: SyncStatus,
    lastSyncAt?: Date
  ): Promise<void> {
    if (lastSyncAt) {
      await this.db.execute(
        `UPDATE tenants
         SET sync_status = $1, last_sync_at = $2, updated_at = NOW()
         WHERE id = $3`,
        [status, lastSyncAt.toISOString(), id]
      );
    } else {
      await this.db.execute(
        `UPDATE tenants
         SET sync_status = $1, updated_at = NOW()
         WHERE id = $2`,
        [status, id]
      );
    }
  }

  async getTenantsByStatus(status: SyncStatus): Promise<Tenant[]> {
    return this.db.query<Tenant>(
      `SELECT * FROM tenants WHERE sync_status = $1`,
      [status]
    );
  }
}
