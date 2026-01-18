import type { ThresholdRepository } from "@/db/repositories/threshold";
import type { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import { jsonWithCors, parsePaginationParams } from "./utils";

export interface ProductRouteDeps {
  thresholdRepo?: ThresholdRepository | undefined;
  stockSnapshotRepo?: StockSnapshotRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
}

// Mock data for development
const mockProducts = [
  { id: "p1", bsaleId: 1001, sku: "SKU001", name: "Producto A", currentStock: 5, threshold: 10, unitPrice: 1500, lastSyncAt: new Date().toISOString() },
  { id: "p2", bsaleId: 1002, sku: "SKU002", name: "Producto B", currentStock: 150, threshold: 20, unitPrice: 2500, lastSyncAt: new Date().toISOString() },
  { id: "p3", bsaleId: 1003, sku: "SKU003", name: "Producto C", currentStock: 0, threshold: 5, unitPrice: 990, lastSyncAt: new Date().toISOString() },
  { id: "p4", bsaleId: 1004, sku: "SKU004", name: "Producto D", currentStock: 75, threshold: 15, unitPrice: 3200, lastSyncAt: new Date().toISOString() },
  { id: "p5", bsaleId: 1005, sku: "SKU005", name: "Producto E", currentStock: 200, threshold: null, unitPrice: null, lastSyncAt: new Date().toISOString() },
];

export interface ProductRoutes {
  "/api/products": {
    GET: (req: Request) => Promise<Response>;
  };
  "/api/products/:id": {
    GET: (req: Bun.BunRequest<"/api/products/:id">) => Promise<Response>;
  };
}

export function createProductRoutes(deps: ProductRouteDeps): ProductRoutes {
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
    "/api/products": {
      GET: async (req) => {
        const url = new URL(req.url);
        const { page, limit, offset } = parsePaginationParams(url);

        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        // If stockSnapshotRepo available and authenticated, use real data
        if (authContext && deps.stockSnapshotRepo && deps.thresholdRepo) {
          const [paginatedSnapshots, thresholds] = await Promise.all([
            deps.stockSnapshotRepo.getLatestByTenantPaginated(authContext.tenantId, { limit, offset }),
            deps.thresholdRepo.getByUser(authContext.userId),
          ]);

          // Create a map of variant thresholds for quick lookup
          const thresholdMap = new Map<number, number>();
          for (const t of thresholds) {
            if (t.bsale_variant_id !== null) {
              thresholdMap.set(t.bsale_variant_id, t.min_quantity);
            }
          }

          // Transform snapshots to products
          const products = paginatedSnapshots.data.map((s) => ({
            id: s.id,
            bsaleId: s.bsale_variant_id,
            sku: s.sku ?? "",
            name: s.product_name ?? `Product ${String(s.bsale_variant_id)}`,
            currentStock: s.quantity_available,
            threshold: thresholdMap.get(s.bsale_variant_id) ?? null,
            unitPrice: s.unit_price,
            lastSyncAt: s.created_at.toISOString(),
          }));

          return jsonWithCors({
            data: products,
            pagination: paginatedSnapshots.pagination,
          });
        }

        // Fallback to mock data with pagination
        const total = mockProducts.length;
        const paginatedProducts = mockProducts.slice(offset, offset + limit);
        return jsonWithCors({
          data: paginatedProducts,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      },
    },

    "/api/products/:id": {
      GET: async (req) => {
        const productId = req.params.id;

        // Try to get authenticated user context
        const authContext = await tryAuthenticate(req);

        if (authContext && deps.stockSnapshotRepo?.getById) {
          const snapshot = await deps.stockSnapshotRepo.getById(productId);
          if (snapshot) {
            return jsonWithCors({
              id: snapshot.id,
              name: snapshot.product_name ?? `Variant ${String(snapshot.bsale_variant_id)}`,
              sku: snapshot.sku ?? "",
              barcode: snapshot.barcode,
              currentStock: snapshot.quantity_available,
              reservedStock: snapshot.quantity_reserved,
              totalStock: snapshot.quantity,
              lastUpdated: snapshot.snapshot_date.toISOString(),
            });
          }
          // Fall through to mock data if not found in DB
        }

        // Fallback to mock data
        const product = mockProducts.find((p) => p.id === productId);
        if (!product) {
          return jsonWithCors({ error: "Product not found" }, { status: 404 });
        }
        return jsonWithCors(product);
      },
    },
  };
}
