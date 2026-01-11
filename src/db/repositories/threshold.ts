import type { DatabaseClient } from "@/db/client";
import type { Threshold } from "./types";

export class ThresholdRepository {
  constructor(private db: DatabaseClient) {}

  async getByTenant(tenantId: string): Promise<Threshold[]> {
    return this.db.query<Threshold>(
      `SELECT * FROM thresholds WHERE tenant_id = $1`,
      [tenantId]
    );
  }

  async getByUser(userId: string): Promise<Threshold[]> {
    return this.db.query<Threshold>(
      `SELECT * FROM thresholds WHERE user_id = $1`,
      [userId]
    );
  }

  async getByVariant(
    tenantId: string,
    variantId: number,
    officeId: number | null
  ): Promise<Threshold[]> {
    // Get both specific thresholds and default thresholds (variant_id IS NULL)
    if (officeId === null) {
      return this.db.query<Threshold>(
        `SELECT * FROM thresholds
         WHERE tenant_id = $1
           AND (bsale_variant_id = $2 OR bsale_variant_id IS NULL)
           AND bsale_office_id IS NULL
         ORDER BY bsale_variant_id NULLS LAST`,
        [tenantId, variantId]
      );
    }
    return this.db.query<Threshold>(
      `SELECT * FROM thresholds
       WHERE tenant_id = $1
         AND (bsale_variant_id = $2 OR bsale_variant_id IS NULL)
         AND (bsale_office_id = $3 OR bsale_office_id IS NULL)
       ORDER BY bsale_variant_id NULLS LAST, bsale_office_id NULLS LAST`,
      [tenantId, variantId, officeId]
    );
  }

  async getDefaultThreshold(userId: string): Promise<Threshold | null> {
    return this.db.queryOne<Threshold>(
      `SELECT * FROM thresholds
       WHERE user_id = $1
         AND bsale_variant_id IS NULL
         AND bsale_office_id IS NULL`,
      [userId]
    );
  }
}
