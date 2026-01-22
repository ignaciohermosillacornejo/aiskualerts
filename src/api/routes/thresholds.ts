import { z } from "zod";
import type { ThresholdRepository } from "@/db/repositories/threshold";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import type { ThresholdLimitService } from "@/billing/threshold-limit-service";
import { jsonWithCors, responseWithCors, createValidationErrorResponse, parsePaginationParams } from "./utils";

export interface ThresholdRouteDeps {
  thresholdRepo?: ThresholdRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
  thresholdLimitService?: ThresholdLimitService | undefined;
}

// Zod schemas for API request validation
export const CreateThresholdSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  thresholdType: z.enum(["quantity", "days"]).default("quantity"),
  minQuantity: z.number().int().nonnegative().optional(),
  minDays: z.number().int().positive().optional(),
}).refine(
  (data) => {
    // Check if appropriate field is provided based on threshold type
    const type = data.thresholdType;
    if (type === "quantity") return data.minQuantity !== undefined;
    return data.minDays !== undefined;
  },
  { message: "minQuantity required for quantity type, minDays required for days type" }
);

export const UpdateThresholdSchema = z.object({
  thresholdType: z.enum(["quantity", "days"]).optional(),
  minQuantity: z.number().int().nonnegative().optional(),
  minDays: z.number().int().positive().optional(),
});

// Mock product data for name lookup
const mockProducts = [
  { id: "p1", name: "Producto A - SKU001" },
  { id: "p2", name: "Producto B - SKU002" },
  { id: "p3", name: "Producto C - SKU003" },
  { id: "p4", name: "Producto D - SKU004" },
  { id: "p5", name: "Producto E - SKU005" },
];

interface MockThreshold {
  id: string;
  productId: string;
  productName: string;
  thresholdType: "quantity" | "days";
  minQuantity: number | null;
  minDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThresholdRoutes {
  "/api/thresholds": {
    GET: (req: Request) => Promise<Response>;
    POST: (req: Request) => Promise<Response>;
  };
  "/api/thresholds/:id": {
    PUT: (req: Bun.BunRequest<"/api/thresholds/:id">) => Promise<Response>;
    DELETE: (req: Bun.BunRequest<"/api/thresholds/:id">) => Promise<Response>;
  };
}

export function createThresholdRoutes(deps: ThresholdRouteDeps): ThresholdRoutes {
  // Per-instance mock data to avoid test isolation issues
  const mockThresholds: MockThreshold[] = [
    { id: "t1", productId: "p1", productName: "Producto A - SKU001", thresholdType: "quantity", minQuantity: 10, minDays: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "t2", productId: "p2", productName: "Producto B - SKU002", thresholdType: "quantity", minQuantity: 20, minDays: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "t3", productId: "p3", productName: "Producto C - SKU003", thresholdType: "quantity", minQuantity: 5, minDays: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  // Helper to authenticate request and return context or null (for optional auth)
  async function tryAuthenticate(req: Request): Promise<AuthContext | null> {
    if (!deps.authMiddleware) return null;
    try {
      return await deps.authMiddleware.authenticate(req);
    } catch {
      return null;
    }
  }

  return {
    "/api/thresholds": {
      GET: async (req) => {
        const url = new URL(req.url);
        const { page, limit, offset } = parsePaginationParams(url);

        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If thresholdRepo available and authenticated, use real data
        if (authContext && deps.thresholdRepo) {
          const paginatedThresholds = await deps.thresholdRepo.getByUserPaginated(
            authContext.userId,
            { limit, offset }
          );

          // Get active threshold IDs from limit service (for freemium limits)
          let activeThresholdIds: Set<string> | null = null;
          if (deps.thresholdLimitService) {
            try {
              activeThresholdIds = await deps.thresholdLimitService.getActiveThresholdIds(
                authContext.userId
              );
            } catch {
              // If limit service fails, treat all as active for graceful degradation
              activeThresholdIds = null;
            }
          }

          // Transform DB thresholds to API format
          const apiThresholds = paginatedThresholds.data.map((t) => ({
            id: t.id,
            productId: t.bsale_variant_id ? String(t.bsale_variant_id) : null,
            productName: t.bsale_variant_id
              ? `Product ${String(t.bsale_variant_id)}`
              : "Default Threshold",
            thresholdType: t.threshold_type,
            minQuantity: t.min_quantity,
            minDays: t.min_days,
            createdAt: t.created_at.toISOString(),
            updatedAt: t.updated_at.toISOString(),
            // If no limit service or it failed, treat all as active
            isActive: activeThresholdIds === null ? true : activeThresholdIds.has(t.id),
          }));

          return jsonWithCors({
            data: apiThresholds,
            pagination: paginatedThresholds.pagination,
          });
        }

        // Fallback to mock data with pagination
        const total = mockThresholds.length;
        const paginatedThresholds = mockThresholds.slice(offset, offset + limit);
        return jsonWithCors({
          data: paginatedThresholds,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      },

      POST: async (req) => {
        const parseResult = CreateThresholdSchema.safeParse(await req.json());
        if (!parseResult.success) {
          return createValidationErrorResponse(parseResult.error);
        }
        const body = parseResult.data;

        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If thresholdRepo available and authenticated, use real data
        if (authContext && deps.thresholdRepo) {
          const threshold = await deps.thresholdRepo.create({
            tenant_id: authContext.tenantId,
            created_by: authContext.userId,
            bsale_variant_id: parseInt(body.productId, 10) || null,
            threshold_type: body.thresholdType,
            min_quantity: body.minQuantity ?? null,
            min_days: body.minDays ?? null,
          });

          return jsonWithCors(
            {
              id: threshold.id,
              productId: threshold.bsale_variant_id
                ? String(threshold.bsale_variant_id)
                : null,
              productName: threshold.bsale_variant_id
                ? `Product ${String(threshold.bsale_variant_id)}`
                : "Default Threshold",
              thresholdType: threshold.threshold_type,
              minQuantity: threshold.min_quantity,
              minDays: threshold.min_days,
              createdAt: threshold.created_at.toISOString(),
              updatedAt: threshold.updated_at.toISOString(),
            },
            { status: 201 }
          );
        }

        // Fallback to mock data
        const newThreshold: MockThreshold = {
          id: `t${String(Date.now())}`,
          productId: body.productId,
          productName:
            mockProducts.find((p) => p.id === body.productId)?.name ?? "Unknown",
          thresholdType: body.thresholdType,
          minQuantity: body.minQuantity ?? null,
          minDays: body.minDays ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockThresholds.push(newThreshold);
        return jsonWithCors(newThreshold, { status: 201 });
      },
    },

    "/api/thresholds/:id": {
      PUT: async (req) => {
        const id = req.params.id;
        const parseResult = UpdateThresholdSchema.safeParse(await req.json());
        if (!parseResult.success) {
          return createValidationErrorResponse(parseResult.error);
        }
        const body = parseResult.data;

        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If thresholdRepo available and authenticated, use real data
        if (authContext && deps.thresholdRepo) {
          const existingThreshold = await deps.thresholdRepo.getById(id);
          if (!existingThreshold) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }
          // Verify user owns this threshold
          if (existingThreshold.user_id !== authContext.userId) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }

          const updateInput: Parameters<typeof deps.thresholdRepo.update>[1] = {};
          if (body.thresholdType !== undefined) updateInput.threshold_type = body.thresholdType;
          if (body.minQuantity !== undefined) updateInput.min_quantity = body.minQuantity;
          if (body.minDays !== undefined) updateInput.min_days = body.minDays;

          const updated = await deps.thresholdRepo.update(id, updateInput);

          return jsonWithCors({
            id: updated.id,
            productId: updated.bsale_variant_id
              ? String(updated.bsale_variant_id)
              : null,
            productName: updated.bsale_variant_id
              ? `Product ${String(updated.bsale_variant_id)}`
              : "Default Threshold",
            thresholdType: updated.threshold_type,
            minQuantity: updated.min_quantity,
            minDays: updated.min_days,
            createdAt: updated.created_at.toISOString(),
            updatedAt: updated.updated_at.toISOString(),
          });
        }

        // Fallback to mock data
        const idx = mockThresholds.findIndex((t) => t.id === id);
        if (idx === -1) {
          return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
        }
        // eslint-disable-next-line security/detect-object-injection -- idx is validated numeric index from findIndex, -1 case handled above
        const existing = mockThresholds[idx];
        if (existing) {
          // eslint-disable-next-line security/detect-object-injection -- idx is validated numeric index from findIndex, -1 case handled above
          mockThresholds[idx] = {
            ...existing,
            thresholdType: body.thresholdType ?? existing.thresholdType,
            minQuantity: body.minQuantity ?? existing.minQuantity,
            minDays: body.minDays ?? existing.minDays,
            updatedAt: new Date().toISOString(),
          };
        }
        // eslint-disable-next-line security/detect-object-injection -- idx is validated numeric index from findIndex, -1 case handled above
        return jsonWithCors(mockThresholds[idx]);
      },

      DELETE: async (req) => {
        const id = req.params.id;

        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If thresholdRepo available and authenticated, use real data
        if (authContext && deps.thresholdRepo) {
          const existingThreshold = await deps.thresholdRepo.getById(id);
          if (!existingThreshold) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }
          // Verify user owns this threshold
          if (existingThreshold.user_id !== authContext.userId) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }

          const deleted = await deps.thresholdRepo.delete(id);
          if (!deleted) {
            return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
          }
          return responseWithCors(null, { status: 204 });
        }

        // Fallback to mock data
        const idx = mockThresholds.findIndex((t) => t.id === id);
        if (idx === -1) {
          return jsonWithCors({ error: "Threshold not found" }, { status: 404 });
        }
        mockThresholds.splice(idx, 1);
        return responseWithCors(null, { status: 204 });
      },
    },
  };
}
