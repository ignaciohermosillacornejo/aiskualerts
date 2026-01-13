import { z } from "zod";
import type { ThresholdRepository } from "@/db/repositories/threshold";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import { jsonWithCors, responseWithCors, createValidationErrorResponse, parsePaginationParams } from "./utils";

export interface ThresholdRouteDeps {
  thresholdRepo?: ThresholdRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
}

// Zod schemas for API request validation
export const CreateThresholdSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  minQuantity: z.number().int().nonnegative("minQuantity must be a non-negative integer"),
});

export const UpdateThresholdSchema = z.object({
  minQuantity: z.number().int().nonnegative("minQuantity must be a non-negative integer"),
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
  minQuantity: number;
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
    { id: "t1", productId: "p1", productName: "Producto A - SKU001", minQuantity: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "t2", productId: "p2", productName: "Producto B - SKU002", minQuantity: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "t3", productId: "p3", productName: "Producto C - SKU003", minQuantity: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
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

          // Transform DB thresholds to API format
          const apiThresholds = paginatedThresholds.data.map((t) => ({
            id: t.id,
            productId: t.bsale_variant_id ? String(t.bsale_variant_id) : null,
            productName: t.bsale_variant_id
              ? `Product ${String(t.bsale_variant_id)}`
              : "Default Threshold",
            minQuantity: t.min_quantity,
            createdAt: t.created_at.toISOString(),
            updatedAt: t.updated_at.toISOString(),
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
            user_id: authContext.userId,
            bsale_variant_id: parseInt(body.productId, 10) || null,
            min_quantity: body.minQuantity,
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
              minQuantity: threshold.min_quantity,
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
          minQuantity: body.minQuantity,
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

          const updated = await deps.thresholdRepo.update(id, {
            min_quantity: body.minQuantity,
          });

          return jsonWithCors({
            id: updated.id,
            productId: updated.bsale_variant_id
              ? String(updated.bsale_variant_id)
              : null,
            productName: updated.bsale_variant_id
              ? `Product ${String(updated.bsale_variant_id)}`
              : "Default Threshold",
            minQuantity: updated.min_quantity,
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
            minQuantity: body.minQuantity,
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
