import type { ThresholdRepository } from "@/db/repositories/threshold";
import type { StockSnapshotRepository } from "@/db/repositories/stock-snapshot";
import type { AlertRepository } from "@/db/repositories/alert";
import type { DailyConsumptionRepository } from "@/db/repositories/daily-consumption";
import type { AuthMiddleware, AuthContext } from "@/api/middleware/auth";
import { createVelocityCalculator } from "@/services/velocity-calculator";
import { jsonWithCors, parsePaginationParams } from "./utils";

export interface ProductRouteDeps {
  thresholdRepo?: ThresholdRepository | undefined;
  stockSnapshotRepo?: StockSnapshotRepository | undefined;
  alertRepo?: AlertRepository | undefined;
  consumptionRepo?: DailyConsumptionRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
}

// Mock data for development
const mockProducts = [
  { id: "p1", bsaleId: 1001, sku: "SKU001", name: "Producto A", currentStock: 5, threshold: 10, thresholdType: "quantity" as const, minDays: null, velocityInfo: null, alertState: "alert" as const, unitPrice: 1500, lastSyncAt: new Date().toISOString() },
  { id: "p2", bsaleId: 1002, sku: "SKU002", name: "Producto B", currentStock: 150, threshold: 20, thresholdType: "quantity" as const, minDays: null, velocityInfo: null, alertState: "ok" as const, unitPrice: 2500, lastSyncAt: new Date().toISOString() },
  { id: "p3", bsaleId: 1003, sku: "SKU003", name: "Producto C", currentStock: 0, threshold: 5, thresholdType: "quantity" as const, minDays: null, velocityInfo: null, alertState: "alert" as const, unitPrice: 990, lastSyncAt: new Date().toISOString() },
  { id: "p4", bsaleId: 1004, sku: "SKU004", name: "Producto D", currentStock: 75, threshold: null, thresholdType: "days" as const, minDays: 7, velocityInfo: { daysLeft: 10, avgDailyConsumption: 7.5, weeklyConsumption: 52.5 }, alertState: "ok" as const, unitPrice: 3200, lastSyncAt: new Date().toISOString() },
  { id: "p5", bsaleId: 1005, sku: "SKU005", name: "Producto E", currentStock: 200, threshold: null, thresholdType: null, minDays: null, velocityInfo: null, alertState: "ok" as const, unitPrice: null, lastSyncAt: new Date().toISOString() },
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
          const [paginatedSnapshots, thresholds, alerts] = await Promise.all([
            deps.stockSnapshotRepo.getLatestByTenantPaginated(authContext.tenantId, { limit, offset }),
            deps.thresholdRepo.getByUser(authContext.userId),
            deps.alertRepo ? deps.alertRepo.getPendingByTenant(authContext.tenantId) : Promise.resolve([]),
          ]);

          // Create a map of variant thresholds for quick lookup
          const thresholdMap = new Map<number, {
            minQuantity: number | null;
            thresholdType: string;
            minDays: number | null;
          }>();
          for (const t of thresholds) {
            if (t.bsale_variant_id !== null) {
              thresholdMap.set(t.bsale_variant_id, {
                minQuantity: t.min_quantity,
                thresholdType: t.threshold_type,
                minDays: t.min_days,
              });
            }
          }

          // Create a set of variant IDs with active alerts for quick lookup
          const alertVariantIds = new Set<number>();
          for (const a of alerts) {
            alertVariantIds.add(a.bsale_variant_id);
          }

          // Create velocity calculator if consumptionRepo is provided
          const velocityCalculator = deps.consumptionRepo
            ? createVelocityCalculator({ consumptionRepo: deps.consumptionRepo })
            : null;

          // Transform snapshots to products (with async velocity calculation)
          const products = await Promise.all(paginatedSnapshots.data.map(async (s) => {
            const threshold = thresholdMap.get(s.bsale_variant_id);

            // Calculate velocity for days-based thresholds
            let velocityInfo: {
              daysLeft: number | null;
              avgDailyConsumption: number;
              weeklyConsumption: number;
            } | null = null;
            if (threshold?.thresholdType === "days" && velocityCalculator) {
              const velocity = await velocityCalculator.getVelocityInfo({
                tenantId: authContext.tenantId,
                variantId: s.bsale_variant_id,
                officeId: s.bsale_office_id,
                currentStock: s.quantity_available,
              });
              velocityInfo = {
                daysLeft: velocity.daysLeft === Infinity ? null : velocity.daysLeft,
                avgDailyConsumption: velocity.avgDailyConsumption,
                weeklyConsumption: velocity.weeklyConsumption,
              };
            }

            // Determine alert state
            const hasAlert = alertVariantIds.has(s.bsale_variant_id);
            const alertState: "ok" | "alert" | "dismissed" = hasAlert ? "alert" : "ok";

            return {
              id: s.id,
              bsaleId: s.bsale_variant_id,
              sku: s.sku ?? "",
              name: s.product_name ?? `Product ${String(s.bsale_variant_id)}`,
              currentStock: s.quantity_available,
              threshold: threshold?.minQuantity ?? null,
              thresholdType: threshold?.thresholdType ?? null,
              minDays: threshold?.minDays ?? null,
              velocityInfo,
              alertState,
              unitPrice: s.unit_price,
              lastSyncAt: s.created_at.toISOString(),
            };
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
