import type { BsaleDocument, GetDocumentsOptions } from "@/bsale/types";
import type {
  DailyConsumptionRepository,
  UpsertConsumptionInput,
} from "@/db/repositories/daily-consumption";

export interface ConsumptionSyncDeps {
  bsaleClient: Pick<
    { getAllDocuments: (options: Omit<GetDocumentsOptions, "offset" | "limit">) => Promise<BsaleDocument[]> },
    "getAllDocuments"
  >;
  consumptionRepo: Pick<DailyConsumptionRepository, "upsertBatch">;
}

export interface ConsumptionSyncResult {
  daysProcessed: number;
  variantsUpdated: number;
  documentsProcessed: number;
}

export function createConsumptionSyncService(deps: ConsumptionSyncDeps) {
  return {
    async syncConsumption(
      tenantId: string,
      days = 7
    ): Promise<ConsumptionSyncResult> {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Fetch all documents in date range
      const documents = await deps.bsaleClient.getAllDocuments({
        startDate,
        endDate,
        expand: ["details"],
        state: 0, // Only active/valid documents
      });

      // Aggregate by variant and date
      const aggregated = new Map<string, UpsertConsumptionInput>();

      for (const doc of documents) {
        const docDate = new Date(doc.emissionDate * 1000);
        const dateStr = docDate.toISOString().split("T")[0] ?? "";

        for (const detail of doc.details.items) {
          const key = `${String(detail.variant.id)}:${dateStr}`;
          const existing = aggregated.get(key);

          if (existing) {
            existing.quantitySold += detail.quantity;
            existing.documentCount += 1;
          } else {
            aggregated.set(key, {
              tenantId,
              bsaleVariantId: detail.variant.id,
              bsaleOfficeId: null,
              consumptionDate: docDate,
              quantitySold: detail.quantity,
              documentCount: 1,
            });
          }
        }
      }

      // Upsert all aggregated consumption records
      const inputs = Array.from(aggregated.values());
      if (inputs.length > 0) {
        await deps.consumptionRepo.upsertBatch(inputs);
      }

      return {
        daysProcessed: days,
        variantsUpdated: aggregated.size,
        documentsProcessed: documents.length,
      };
    },
  };
}
