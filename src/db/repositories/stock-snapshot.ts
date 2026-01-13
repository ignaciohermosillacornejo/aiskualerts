import type { DatabaseClient } from "@/db/client";
import type { StockSnapshot, StockSnapshotInput, PaginationParams, PaginatedResult } from "./types";

export class StockSnapshotRepository {
  constructor(private db: DatabaseClient) {}

  async upsertBatch(snapshots: StockSnapshotInput[]): Promise<number> {
    if (snapshots.length === 0) return 0;

    const MAX_BATCH_SIZE = 1000;
    if (snapshots.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size ${String(snapshots.length)} exceeds maximum ${String(MAX_BATCH_SIZE)}`);
    }

    // Validate input data
    for (const s of snapshots) {
      if (!s.tenant_id || typeof s.tenant_id !== 'string') {
        throw new Error('Invalid tenant_id in snapshot');
      }
      if (typeof s.bsale_variant_id !== 'number' || s.bsale_variant_id <= 0) {
        throw new Error('Invalid bsale_variant_id in snapshot');
      }
      if (typeof s.quantity !== 'number' || s.quantity < 0) {
        throw new Error('Invalid quantity in snapshot (must be >= 0)');
      }
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

  /**
   * Get latest stock snapshots for all variants in a tenant
   *
   * Performance Note: This query uses DISTINCT ON which requires proper indexing.
   * Recommended index (add to schema.sql or run migration):
   *
   * CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_snapshots_latest
   * ON stock_snapshots (tenant_id, bsale_variant_id, bsale_office_id, snapshot_date DESC);
   */
  async getLatestByTenant(tenantId: string): Promise<StockSnapshot[]> {
    return this.db.query<StockSnapshot>(
      `SELECT DISTINCT ON (bsale_variant_id, bsale_office_id) *
       FROM stock_snapshots
       WHERE tenant_id = $1
       ORDER BY bsale_variant_id, bsale_office_id, snapshot_date DESC`,
      [tenantId]
    );
  }

  /**
   * Get paginated latest stock snapshots for all variants in a tenant
   */
  async getLatestByTenantPaginated(
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResult<StockSnapshot>> {
    const [snapshots, countResult] = await Promise.all([
      this.db.query<StockSnapshot>(
        `SELECT * FROM (
           SELECT DISTINCT ON (bsale_variant_id, bsale_office_id) *
           FROM stock_snapshots
           WHERE tenant_id = $1
           ORDER BY bsale_variant_id, bsale_office_id, snapshot_date DESC
         ) AS latest
         ORDER BY product_name ASC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [tenantId, pagination.limit, pagination.offset]
      ),
      this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM (
           SELECT DISTINCT ON (bsale_variant_id, bsale_office_id) id
           FROM stock_snapshots
           WHERE tenant_id = $1
           ORDER BY bsale_variant_id, bsale_office_id, snapshot_date DESC
         ) AS latest`,
        [tenantId]
      ),
    ]);

    const total = parseInt(countResult?.count ?? "0", 10);
    const page = Math.floor(pagination.offset / pagination.limit) + 1;

    return {
      data: snapshots,
      pagination: {
        page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
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

  /**
   * Get historical snapshots for velocity calculation
   * Returns snapshots ordered by date descending (most recent first)
   */
  async getHistoricalSnapshots(
    tenantId: string,
    variantId: number,
    officeId: number | null,
    days: number
  ): Promise<StockSnapshot[]> {
    if (officeId === null) {
      return this.db.query<StockSnapshot>(
        `SELECT * FROM stock_snapshots
         WHERE tenant_id = $1
           AND bsale_variant_id = $2
           AND bsale_office_id IS NULL
           AND snapshot_date >= CURRENT_DATE - $3::integer
         ORDER BY snapshot_date DESC`,
        [tenantId, variantId, days]
      );
    }
    return this.db.query<StockSnapshot>(
      `SELECT * FROM stock_snapshots
       WHERE tenant_id = $1
         AND bsale_variant_id = $2
         AND bsale_office_id = $3
         AND snapshot_date >= CURRENT_DATE - $4::integer
       ORDER BY snapshot_date DESC`,
      [tenantId, variantId, officeId, days]
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

  async countDistinctProductsByTenant(tenantId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT bsale_variant_id) as count
       FROM stock_snapshots
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return parseInt(result?.count ?? "0", 10);
  }

  async countLowStockByTenant(
    tenantId: string,
    thresholdQuantity: number
  ): Promise<number> {
    // Count products where latest snapshot shows quantity below threshold
    const result = await this.db.queryOne<{ count: string }>(
      `WITH latest_snapshots AS (
         SELECT DISTINCT ON (bsale_variant_id, bsale_office_id)
           bsale_variant_id, quantity_available
         FROM stock_snapshots
         WHERE tenant_id = $1
         ORDER BY bsale_variant_id, bsale_office_id, snapshot_date DESC
       )
       SELECT COUNT(*) as count
       FROM latest_snapshots
       WHERE quantity_available < $2`,
      [tenantId, thresholdQuantity]
    );
    return parseInt(result?.count ?? "0", 10);
  }
}
