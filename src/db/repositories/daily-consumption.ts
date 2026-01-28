import type { DatabaseClient } from "@/db/client";

/** Format a Date as YYYY-MM-DD for PostgreSQL DATE columns */
function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

export interface DailyConsumption {
  id: string;
  tenantId: string;
  bsaleVariantId: number;
  bsaleOfficeId: number | null;
  consumptionDate: Date;
  quantitySold: number;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertConsumptionInput {
  tenantId: string;
  bsaleVariantId: number;
  bsaleOfficeId?: number | null;
  consumptionDate: Date;
  quantitySold: number;
  documentCount: number;
}

interface ConsumptionRow {
  id: string;
  tenant_id: string;
  bsale_variant_id: number;
  bsale_office_id: number | null;
  consumption_date: Date;
  quantity_sold: number;
  document_count: number;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: ConsumptionRow): DailyConsumption {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    bsaleVariantId: row.bsale_variant_id,
    bsaleOfficeId: row.bsale_office_id,
    consumptionDate: row.consumption_date,
    quantitySold: row.quantity_sold,
    documentCount: row.document_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface DailyConsumptionRepository {
  upsert(input: UpsertConsumptionInput): Promise<DailyConsumption>;
  upsertBatch(inputs: UpsertConsumptionInput[]): Promise<number>;
  getByVariantAndDate(
    tenantId: string,
    variantId: number,
    officeId: number | null,
    date: Date
  ): Promise<DailyConsumption | null>;
  get7DayAverage(
    tenantId: string,
    variantId: number,
    officeId: number | null
  ): Promise<number>;
  getConsumptionHistory(
    tenantId: string,
    variantId: number,
    officeId: number | null,
    days: number
  ): Promise<DailyConsumption[]>;
}

export function createDailyConsumptionRepository(
  db: DatabaseClient
): DailyConsumptionRepository {
  return {
    async upsert(input: UpsertConsumptionInput): Promise<DailyConsumption> {
      const result = await db.queryOne<ConsumptionRow>(
        `INSERT INTO daily_consumption (
          tenant_id, bsale_variant_id, bsale_office_id,
          consumption_date, quantity_sold, document_count
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, bsale_variant_id, bsale_office_id, consumption_date)
        WHERE bsale_office_id IS NOT NULL
        DO UPDATE SET
          quantity_sold = EXCLUDED.quantity_sold,
          document_count = EXCLUDED.document_count,
          updated_at = NOW()
        RETURNING *`,
        [
          input.tenantId,
          input.bsaleVariantId,
          input.bsaleOfficeId ?? null,
          toDateStr(input.consumptionDate),
          input.quantitySold,
          input.documentCount,
        ]
      );

      // Handle null office_id case with a separate conflict target
      if (!result && input.bsaleOfficeId === null) {
        const nullOfficeResult = await db.queryOne<ConsumptionRow>(
          `INSERT INTO daily_consumption (
            tenant_id, bsale_variant_id, bsale_office_id,
            consumption_date, quantity_sold, document_count
          )
          VALUES ($1, $2, NULL, $3, $4, $5)
          ON CONFLICT (tenant_id, bsale_variant_id, consumption_date)
          WHERE bsale_office_id IS NULL
          DO UPDATE SET
            quantity_sold = EXCLUDED.quantity_sold,
            document_count = EXCLUDED.document_count,
            updated_at = NOW()
          RETURNING *`,
          [
            input.tenantId,
            input.bsaleVariantId,
            toDateStr(input.consumptionDate),
            input.quantitySold,
            input.documentCount,
          ]
        );
        if (nullOfficeResult) {
          return mapRow(nullOfficeResult);
        }
      }

      if (!result) {
        throw new Error("Failed to upsert daily consumption");
      }
      return mapRow(result);
    },

    async upsertBatch(inputs: UpsertConsumptionInput[]): Promise<number> {
      if (inputs.length === 0) {
        return 0;
      }

      // Build batch insert with VALUES clause
      const values: unknown[] = [];
      const valuePlaceholders: string[] = [];

      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (!input) continue;
        const offset = i * 6;
        valuePlaceholders.push(
          `($${String(offset + 1)}, $${String(offset + 2)}, $${String(offset + 3)}, $${String(offset + 4)}, $${String(offset + 5)}, $${String(offset + 6)})`
        );
        values.push(
          input.tenantId,
          input.bsaleVariantId,
          input.bsaleOfficeId ?? null,
          toDateStr(input.consumptionDate),
          input.quantitySold,
          input.documentCount
        );
      }

      await db.execute(
        `INSERT INTO daily_consumption (
          tenant_id, bsale_variant_id, bsale_office_id,
          consumption_date, quantity_sold, document_count
        )
        VALUES ${valuePlaceholders.join(", ")}
        ON CONFLICT (tenant_id, bsale_variant_id, bsale_office_id, consumption_date)
        WHERE bsale_office_id IS NOT NULL
        DO UPDATE SET
          quantity_sold = EXCLUDED.quantity_sold,
          document_count = EXCLUDED.document_count,
          updated_at = NOW()`,
        values
      );

      return inputs.length;
    },

    async getByVariantAndDate(
      tenantId: string,
      variantId: number,
      officeId: number | null,
      date: Date
    ): Promise<DailyConsumption | null> {
      const result = await db.queryOne<ConsumptionRow>(
        `SELECT * FROM daily_consumption
         WHERE tenant_id = $1
           AND bsale_variant_id = $2
           AND bsale_office_id IS NOT DISTINCT FROM $3
           AND consumption_date = $4`,
        [tenantId, variantId, officeId, toDateStr(date)]
      );
      return result ? mapRow(result) : null;
    },

    async get7DayAverage(
      tenantId: string,
      variantId: number,
      officeId: number | null
    ): Promise<number> {
      const result = await db.queryOne<{ avg: string | null }>(
        `SELECT AVG(quantity_sold) as avg
         FROM daily_consumption
         WHERE tenant_id = $1
           AND bsale_variant_id = $2
           AND bsale_office_id IS NOT DISTINCT FROM $3
           AND consumption_date >= CURRENT_DATE - INTERVAL '7 days'`,
        [tenantId, variantId, officeId]
      );
      if (!result?.avg) {
        return 0;
      }
      return parseFloat(result.avg);
    },

    async getConsumptionHistory(
      tenantId: string,
      variantId: number,
      officeId: number | null,
      days: number
    ): Promise<DailyConsumption[]> {
      const rows = await db.query<ConsumptionRow>(
        `SELECT * FROM daily_consumption
         WHERE tenant_id = $1
           AND bsale_variant_id = $2
           AND bsale_office_id IS NOT DISTINCT FROM $3
           AND consumption_date >= CURRENT_DATE - INTERVAL '1 day' * $4
         ORDER BY consumption_date DESC`,
        [tenantId, variantId, officeId, days]
      );
      return rows.map(mapRow);
    },
  };
}
