import type { DatabaseClient } from "@/db/client";
import type { StockSnapshot, StockSnapshotInput } from "./types";

export class StockSnapshotRepository {
  constructor(private db: DatabaseClient) {}

  async upsertBatch(snapshots: StockSnapshotInput[]): Promise<number> {
    if (snapshots.length === 0) return 0;

    const MAX_BATCH_SIZE = 1000;
    if (snapshots.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size ${String(snapshots.length)} exceeds maximum ${String(MAX_BATCH_SIZE)}`);
    }

    const values: unknown[] = [];
    const placeholders: string[] = [];

    snapshots.forEach((s, i) => {
      const offset = i * 10;
      placeholders.push(
        `($${String(offset + 1)}, $${String(offset + 2)}, $${String(offset + 3)}, $${String(offset + 4)}, $${String(offset + 5)}, $${String(offset + 6)}, $${String(offset + 7)}, $${String(offset + 8)}, $${String(offset + 9)}, $${String(offset + 10)})`
      );
      values.push(
        s.tenant_id,
        s.bsale_variant_id,
        s.bsale_office_id,
        s.sku,
        s.barcode,
        s.product_name,
        s.quantity,
        s.quantity_reserved,
        s.quantity_available,
        s.snapshot_date.toISOString().substring(0, 10)
      );
    });

    const query = `
      INSERT INTO stock_snapshots (
        tenant_id, bsale_variant_id, bsale_office_id, sku, barcode,
        product_name, quantity, quantity_reserved, quantity_available, snapshot_date
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (tenant_id, bsale_variant_id, bsale_office_id, snapshot_date)
      DO UPDATE SET
        sku = EXCLUDED.sku,
        barcode = EXCLUDED.barcode,
        product_name = EXCLUDED.product_name,
        quantity = EXCLUDED.quantity,
        quantity_reserved = EXCLUDED.quantity_reserved,
        quantity_available = EXCLUDED.quantity_available
    `;

    await this.db.execute(query, values);
    return snapshots.length;
  }

  async getLatestByTenant(tenantId: string): Promise<StockSnapshot[]> {
    return this.db.query<StockSnapshot>(
      `SELECT DISTINCT ON (bsale_variant_id, bsale_office_id) *
       FROM stock_snapshots
       WHERE tenant_id = $1
       ORDER BY bsale_variant_id, bsale_office_id, snapshot_date DESC`,
      [tenantId]
    );
  }

  async getByVariant(
    tenantId: string,
    variantId: number,
    officeId: number | null
  ): Promise<StockSnapshot | null> {
    if (officeId === null) {
      return this.db.queryOne<StockSnapshot>(
        `SELECT * FROM stock_snapshots
         WHERE tenant_id = $1 AND bsale_variant_id = $2 AND bsale_office_id IS NULL
         ORDER BY snapshot_date DESC
         LIMIT 1`,
        [tenantId, variantId]
      );
    }
    return this.db.queryOne<StockSnapshot>(
      `SELECT * FROM stock_snapshots
       WHERE tenant_id = $1 AND bsale_variant_id = $2 AND bsale_office_id = $3
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [tenantId, variantId, officeId]
    );
  }

  async deleteOlderThan(days: number): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM stock_snapshots
         WHERE snapshot_date < CURRENT_DATE - $1::integer
         RETURNING 1
       )
       SELECT COUNT(*)::integer as count FROM deleted`,
      [days]
    );
    return result[0]?.count ?? 0;
  }
}
