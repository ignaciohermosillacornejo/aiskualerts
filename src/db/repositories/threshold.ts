import type { DatabaseClient } from "@/db/client";
import type { Threshold, PaginationParams, PaginatedResult } from "./types";

export interface CreateThresholdInput {
  tenant_id: string;
  user_id: string;
  bsale_variant_id?: number | null;
  bsale_office_id?: number | null;
  min_quantity: number;
  days_warning?: number;
}

export interface UpdateThresholdInput {
  min_quantity?: number;
  days_warning?: number;
}

export class ThresholdRepository {
  constructor(private db: DatabaseClient) {}

  async getById(thresholdId: string): Promise<Threshold | null> {
    return this.db.queryOne<Threshold>(
      `SELECT * FROM thresholds WHERE id = $1`,
      [thresholdId]
    );
  }

  async create(input: CreateThresholdInput): Promise<Threshold> {
    const result = await this.db.queryOne<Threshold>(
      `INSERT INTO thresholds (tenant_id, user_id, bsale_variant_id, bsale_office_id, min_quantity, days_warning)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.tenant_id,
        input.user_id,
        input.bsale_variant_id ?? null,
        input.bsale_office_id ?? null,
        input.min_quantity,
        input.days_warning ?? 7,
      ]
    );
    if (!result) {
      throw new Error("Failed to create threshold");
    }
    return result;
  }

  async update(thresholdId: string, input: UpdateThresholdInput): Promise<Threshold> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.min_quantity !== undefined) {
      updates.push(`min_quantity = $${String(paramCount++)}`);
      values.push(input.min_quantity);
    }

    if (input.days_warning !== undefined) {
      updates.push(`days_warning = $${String(paramCount++)}`);
      values.push(input.days_warning);
    }

    if (updates.length === 0) {
      const threshold = await this.getById(thresholdId);
      if (!threshold) {
        throw new Error(`Threshold ${thresholdId} not found`);
      }
      return threshold;
    }

    updates.push(`updated_at = NOW()`);
    values.push(thresholdId);

    const result = await this.db.queryOne<Threshold>(
      `UPDATE thresholds SET ${updates.join(", ")} WHERE id = $${String(paramCount)} RETURNING *`,
      values
    );
    if (!result) {
      throw new Error(`Threshold ${thresholdId} not found`);
    }
    return result;
  }

  async delete(thresholdId: string): Promise<boolean> {
    const result = await this.db.queryOne<{ id: string }>(
      `DELETE FROM thresholds WHERE id = $1 RETURNING id`,
      [thresholdId]
    );
    return result !== null;
  }

  async countByUser(userId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM thresholds WHERE user_id = $1`,
      [userId]
    );
    return parseInt(result?.count ?? "0", 10);
  }

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

  async getByUserPaginated(
    userId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Threshold>> {
    const [thresholds, countResult] = await Promise.all([
      this.db.query<Threshold>(
        `SELECT * FROM thresholds
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pagination.limit, pagination.offset]
      ),
      this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM thresholds WHERE user_id = $1`,
        [userId]
      ),
    ]);

    const total = parseInt(countResult?.count ?? "0", 10);
    const page = Math.floor(pagination.offset / pagination.limit) + 1;

    return {
      data: thresholds,
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

  async countByUserAcrossTenants(userId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM thresholds WHERE user_id = $1`,
      [userId]
    );
    return parseInt(result?.count ?? "0", 10);
  }

  async getActiveThresholdsForUser(
    userId: string,
    limit?: number
  ): Promise<Threshold[]> {
    if (limit === undefined) {
      return this.db.query<Threshold>(
        `SELECT * FROM thresholds
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
    }
    return this.db.query<Threshold>(
      `SELECT * FROM thresholds
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [userId, limit]
    );
  }

  async getSkippedThresholdsForUser(
    userId: string,
    offset: number
  ): Promise<Threshold[]> {
    return this.db.query<Threshold>(
      `SELECT * FROM thresholds
       WHERE user_id = $1
       ORDER BY created_at ASC
       OFFSET $2`,
      [userId, offset]
    );
  }
}
