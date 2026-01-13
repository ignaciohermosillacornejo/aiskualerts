import type { DatabaseClient } from "@/db/client";
import type { Tenant, SyncStatus } from "./types";
import type { EncryptionService } from "@/utils/encryption";

export interface CreateTenantInput {
  bsale_client_code: string;
  bsale_client_name: string;
  bsale_access_token: string;
}

export interface UpdateTenantInput {
  bsale_client_name?: string;
  bsale_access_token?: string;
}

export interface TenantRepositoryConfig {
  encryptionService?: EncryptionService;
}

export class TenantRepository {
  private encryptionService?: EncryptionService;

  constructor(private db: DatabaseClient, config?: TenantRepositoryConfig) {
    if (config?.encryptionService) {
      this.encryptionService = config.encryptionService;
    }
  }

  /**
   * Encrypt a token if encryption service is available
   */
  private encryptToken(token: string): string {
    if (!this.encryptionService) {
      return token;
    }
    // Don't double-encrypt
    if (this.encryptionService.isEncrypted(token)) {
      return token;
    }
    return this.encryptionService.encrypt(token);
  }

  /**
   * Decrypt a token if encryption service is available
   */
  private decryptToken(token: string): string {
    if (!this.encryptionService) {
      return token;
    }
    // Only decrypt if it's encrypted
    if (!this.encryptionService.isEncrypted(token)) {
      return token;
    }
    return this.encryptionService.decrypt(token);
  }

  /**
   * Process tenant from database to decrypt token
   */
  private processTenant(tenant: Tenant): Tenant {
    if (!tenant.bsale_access_token) {
      return tenant;
    }
    return {
      ...tenant,
      bsale_access_token: this.decryptToken(tenant.bsale_access_token),
    };
  }

  /**
   * Process multiple tenants from database
   */
  private processTenants(tenants: Tenant[]): Tenant[] {
    return tenants.map((t) => this.processTenant(t));
  }

  async create(input: CreateTenantInput): Promise<Tenant> {
    const encryptedToken = this.encryptToken(input.bsale_access_token);

    const tenants = await this.db.query<Tenant>(
      `INSERT INTO tenants (bsale_client_code, bsale_client_name, bsale_access_token)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.bsale_client_code, input.bsale_client_name, encryptedToken]
    );

    const tenant = tenants[0];
    if (!tenant) {
      throw new Error("Failed to create tenant");
    }

    return this.processTenant(tenant);
  }

  async getAll(): Promise<Tenant[]> {
    const tenants = await this.db.query<Tenant>(`SELECT * FROM tenants`);
    return this.processTenants(tenants);
  }

  async getActiveTenants(): Promise<Tenant[]> {
    const tenants = await this.db.query<Tenant>(
      `SELECT * FROM tenants
       WHERE sync_status != 'syncing'
       ORDER BY last_sync_at ASC NULLS FIRST`
    );
    return this.processTenants(tenants);
  }

  async getById(id: string): Promise<Tenant | null> {
    const tenant = await this.db.queryOne<Tenant>(
      `SELECT * FROM tenants WHERE id = $1`,
      [id]
    );
    return tenant ? this.processTenant(tenant) : null;
  }

  async findByClientCode(clientCode: string): Promise<Tenant | null> {
    const tenant = await this.db.queryOne<Tenant>(
      `SELECT * FROM tenants WHERE bsale_client_code = $1`,
      [clientCode]
    );
    return tenant ? this.processTenant(tenant) : null;
  }

  async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.bsale_client_name !== undefined) {
      updates.push(`bsale_client_name = $${String(paramCount++)}`);
      values.push(input.bsale_client_name);
    }

    if (input.bsale_access_token !== undefined) {
      updates.push(`bsale_access_token = $${String(paramCount++)}`);
      // Encrypt the token before storing
      values.push(this.encryptToken(input.bsale_access_token));
    }

    if (updates.length === 0) {
      const tenant = await this.getById(id);
      if (!tenant) {
        throw new Error(`Tenant ${id} not found`);
      }
      return tenant;
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const tenants = await this.db.query<Tenant>(
      `UPDATE tenants SET ${updates.join(", ")} WHERE id = $${String(paramCount)} RETURNING *`,
      values
    );

    const tenant = tenants[0];
    if (!tenant) {
      throw new Error(`Tenant ${id} not found`);
    }

    return this.processTenant(tenant);
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
    const tenants = await this.db.query<Tenant>(
      `SELECT * FROM tenants WHERE sync_status = $1`,
      [status]
    );
    return this.processTenants(tenants);
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Tenant | null> {
    const tenant = await this.db.queryOne<Tenant>(
      `SELECT * FROM tenants WHERE stripe_customer_id = $1`,
      [stripeCustomerId]
    );
    return tenant ? this.processTenant(tenant) : null;
  }

  async updateStripeCustomer(
    tenantId: string,
    stripeCustomerId: string
  ): Promise<void> {
    await this.db.execute(
      `UPDATE tenants
       SET stripe_customer_id = $1, is_paid = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [stripeCustomerId, tenantId]
    );
  }

  async updatePaidStatus(
    stripeCustomerId: string,
    isPaid: boolean
  ): Promise<void> {
    await this.db.execute(
      `UPDATE tenants
       SET is_paid = $1, updated_at = NOW()
       WHERE stripe_customer_id = $2`,
      [isPaid, stripeCustomerId]
    );
  }
}
