import type { DatabaseClient } from "@/db/client";
import type { Alert, AlertInput } from "./types";

export interface AlertFilter {
  type?: "low_stock" | "out_of_stock" | "low_velocity";
  status?: "pending" | "sent" | "dismissed";
  limit?: number;
}

export class AlertRepository {
  constructor(private db: DatabaseClient) {}

  async getById(alertId: string): Promise<Alert | null> {
    return this.db.queryOne<Alert>(
      `SELECT * FROM alerts WHERE id = $1`,
      [alertId]
    );
  }

  async findByUserWithFilter(
    userId: string,
    filter?: AlertFilter
  ): Promise<{ alerts: Alert[]; total: number }> {
    const conditions = ["user_id = $1"];
    const values: unknown[] = [userId];
    let paramCount = 2;

    if (filter?.type) {
      conditions.push(`alert_type = $${String(paramCount++)}`);
      values.push(filter.type);
    }

    if (filter?.status) {
      conditions.push(`status = $${String(paramCount++)}`);
      values.push(filter.status);
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM alerts WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult?.count ?? "0", 10);

    // Get alerts with limit
    const limit = filter?.limit ?? 100;
    const alerts = await this.db.query<Alert>(
      `SELECT * FROM alerts WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${String(paramCount)}`,
      [...values, limit]
    );

    return { alerts, total };
  }

  async countPendingByUser(userId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM alerts WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    return parseInt(result?.count ?? "0", 10);
  }

  async create(input: AlertInput): Promise<Alert> {
    const result = await this.db.queryOne<Alert>(
      `INSERT INTO alerts (
         tenant_id, user_id, bsale_variant_id, bsale_office_id,
         sku, product_name, alert_type, current_quantity,
         threshold_quantity, days_to_stockout
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.tenant_id,
        input.user_id,
        input.bsale_variant_id,
        input.bsale_office_id,
        input.sku,
        input.product_name,
        input.alert_type,
        input.current_quantity,
        input.threshold_quantity,
        input.days_to_stockout,
      ]
    );
    if (!result) {
      throw new Error("Failed to create alert");
    }
    return result;
  }

  async createBatch(inputs: AlertInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    const MAX_BATCH_SIZE = 1000;
    if (inputs.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size ${String(inputs.length)} exceeds maximum ${String(MAX_BATCH_SIZE)}`);
    }

    const values: unknown[] = [];
    const placeholders: string[] = [];

    inputs.forEach((input, i) => {
      const offset = i * 10;
      placeholders.push(
        `($${String(offset + 1)}, $${String(offset + 2)}, $${String(offset + 3)}, $${String(offset + 4)}, $${String(offset + 5)}, $${String(offset + 6)}, $${String(offset + 7)}, $${String(offset + 8)}, $${String(offset + 9)}, $${String(offset + 10)})`
      );
      values.push(
        input.tenant_id,
        input.user_id,
        input.bsale_variant_id,
        input.bsale_office_id,
        input.sku,
        input.product_name,
        input.alert_type,
        input.current_quantity,
        input.threshold_quantity,
        input.days_to_stockout
      );
    });

    await this.db.execute(
      `INSERT INTO alerts (
         tenant_id, user_id, bsale_variant_id, bsale_office_id,
         sku, product_name, alert_type, current_quantity,
         threshold_quantity, days_to_stockout
       )
       VALUES ${placeholders.join(", ")}`,
      values
    );

    return inputs.length;
  }

  async getPendingByUser(userId: string): Promise<Alert[]> {
    return this.db.query<Alert>(
      `SELECT * FROM alerts
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [userId]
    );
  }

  async getPendingByTenant(tenantId: string): Promise<Alert[]> {
    return this.db.query<Alert>(
      `SELECT * FROM alerts
       WHERE tenant_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [tenantId]
    );
  }

  async getPendingByTenants(tenantIds: string[]): Promise<Alert[]> {
    if (tenantIds.length === 0) return [];

    const placeholders = tenantIds.map((_, i) => `$${String(i + 1)}`).join(", ");
    return this.db.query<Alert>(
      `SELECT * FROM alerts
       WHERE tenant_id IN (${placeholders}) AND status = 'pending'
       ORDER BY created_at DESC`,
      tenantIds
    );
  }

  async markAsSent(alertIds: string[]): Promise<void> {
    if (alertIds.length === 0) return;

    const placeholders = alertIds.map((_, i) => `$${String(i + 1)}`).join(", ");
    await this.db.execute(
      `UPDATE alerts
       SET status = 'sent', sent_at = NOW()
       WHERE id IN (${placeholders})`,
      alertIds
    );
  }

  async markAsDismissed(alertId: string, dismissedBy: string): Promise<void> {
    await this.db.execute(
      `UPDATE alerts
       SET status = 'dismissed',
           dismissed_by = $2,
           dismissed_at = now()
       WHERE id = $1`,
      [alertId, dismissedBy]
    );
  }

  async findDismissedByVariant(
    tenantId: string,
    variantId: number,
    officeId: number | null
  ): Promise<Alert[]> {
    return this.db.query<Alert>(
      `SELECT * FROM alerts
       WHERE tenant_id = $1
         AND bsale_variant_id = $2
         AND bsale_office_id IS NOT DISTINCT FROM $3
         AND status = 'dismissed'
       ORDER BY created_at DESC`,
      [tenantId, variantId, officeId]
    );
  }

  async resetAlert(alertId: string): Promise<void> {
    await this.db.execute(
      `UPDATE alerts SET status = 'resolved' WHERE id = $1`,
      [alertId]
    );
  }

  async hasActiveOrDismissedAlert(
    tenantId: string,
    variantId: number,
    officeId: number | null,
    alertType: string
  ): Promise<{ hasActive: boolean; hasDismissed: boolean }> {
    const result = await this.db.queryOne<{
      has_active: boolean;
      has_dismissed: boolean;
    }>(
      `SELECT
         EXISTS(SELECT 1 FROM alerts WHERE tenant_id = $1 AND bsale_variant_id = $2
                AND bsale_office_id IS NOT DISTINCT FROM $3 AND alert_type = $4
                AND status = 'pending') as has_active,
         EXISTS(SELECT 1 FROM alerts WHERE tenant_id = $1 AND bsale_variant_id = $2
                AND bsale_office_id IS NOT DISTINCT FROM $3 AND alert_type = $4
                AND status = 'dismissed') as has_dismissed`,
      [tenantId, variantId, officeId, alertType]
    );
    return {
      hasActive: result?.has_active ?? false,
      hasDismissed: result?.has_dismissed ?? false,
    };
  }

  async hasPendingAlert(
    userId: string,
    variantId: number,
    officeId: number | null,
    alertType: "low_stock" | "out_of_stock" | "low_velocity"
  ): Promise<boolean> {
    const result = await this.db.queryOne<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM alerts
         WHERE user_id = $1
           AND bsale_variant_id = $2
           AND (bsale_office_id = $3 OR ($3 IS NULL AND bsale_office_id IS NULL))
           AND alert_type = $4
           AND status = 'pending'
       ) as exists`,
      [userId, variantId, officeId, alertType]
    );
    return result?.exists ?? false;
  }

  async hasPendingAlertForTenant(
    tenantId: string,
    variantId: number,
    officeId: number | null,
    alertType: "low_stock" | "out_of_stock" | "low_velocity"
  ): Promise<boolean> {
    const result = await this.db.queryOne<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM alerts
         WHERE tenant_id = $1
           AND bsale_variant_id = $2
           AND (bsale_office_id = $3 OR ($3 IS NULL AND bsale_office_id IS NULL))
           AND alert_type = $4
           AND status = 'pending'
       ) as exists`,
      [tenantId, variantId, officeId, alertType]
    );
    return result?.exists ?? false;
  }

  async findByTenantWithFilter(
    tenantId: string,
    filter?: AlertFilter
  ): Promise<{ alerts: Alert[]; total: number }> {
    const conditions = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filter?.type) {
      conditions.push(`alert_type = $${String(paramCount++)}`);
      values.push(filter.type);
    }

    if (filter?.status) {
      conditions.push(`status = $${String(paramCount++)}`);
      values.push(filter.status);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM alerts WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult?.count ?? "0", 10);

    const limit = filter?.limit ?? 100;
    const alerts = await this.db.query<Alert>(
      `SELECT * FROM alerts WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${String(paramCount)}`,
      [...values, limit]
    );

    return { alerts, total };
  }

  async countPendingByTenant(tenantId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM alerts WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId]
    );
    return parseInt(result?.count ?? "0", 10);
  }
}
