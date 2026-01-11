import type { DatabaseClient } from "@/db/client";
import type { Alert, AlertInput } from "./types";

export class AlertRepository {
  constructor(private db: DatabaseClient) {}

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

  async markAsDismissed(alertId: string): Promise<void> {
    await this.db.execute(
      `UPDATE alerts SET status = 'dismissed' WHERE id = $1`,
      [alertId]
    );
  }

  async hasPendingAlert(
    userId: string,
    variantId: number,
    officeId: number | null,
    alertType: "threshold_breach" | "low_velocity"
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
}
