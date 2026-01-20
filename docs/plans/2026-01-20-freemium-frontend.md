# Freemium Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add freemium limit UI to the frontend showing usage counts, inactive threshold badges, upgrade banners, and usage meter in settings.

**Architecture:** The backend `/api/settings/limits` endpoint already exists. We need to add `isActive` to each threshold from the `/api/thresholds` endpoint by injecting the ThresholdLimitService. Frontend will consume both endpoints to display limit status and mark inactive thresholds.

**Tech Stack:** React, TypeScript, Bun test, existing CSS classes (badge-*, btn-*, card)

---

## Task 1: Add isActive to Thresholds API Response

**Files:**
- Modify: `src/api/routes/thresholds.ts`
- Modify: `src/server.ts` (wire up thresholdLimitService)
- Test: `tests/unit/api/routes/thresholds.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/api/routes/thresholds.test.ts`:

```typescript
describe("GET /api/thresholds with limit service", () => {
  test("includes isActive field based on threshold limit service", async () => {
    const mockThresholdRepo = {
      getByUserPaginated: mock(() =>
        Promise.resolve({
          data: [
            { id: "t1", user_id: "user-1", tenant_id: "tenant-1", bsale_variant_id: 100, min_quantity: 10, created_at: new Date(), updated_at: new Date() },
            { id: "t2", user_id: "user-1", tenant_id: "tenant-1", bsale_variant_id: 200, min_quantity: 20, created_at: new Date(), updated_at: new Date() },
          ],
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        })
      ),
    };

    const mockThresholdLimitService = {
      getActiveThresholdIds: mock(() => Promise.resolve(new Set(["t1"]))),
      getUserLimitInfo: mock(),
      getSkippedCount: mock(),
    };

    const mockAuthMiddleware = {
      authenticate: mock(() =>
        Promise.resolve({ userId: "user-1", tenantId: "tenant-1" })
      ),
    };

    const routes = createThresholdRoutes({
      thresholdRepo: mockThresholdRepo as unknown as ThresholdRepository,
      authMiddleware: mockAuthMiddleware as unknown as AuthMiddleware,
      thresholdLimitService: mockThresholdLimitService as unknown as ThresholdLimitService,
    });

    const response = await routes["/api/thresholds"].GET(
      new Request("http://localhost/api/thresholds")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].isActive).toBe(true);
    expect(body.data[1].isActive).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/api/routes/thresholds.test.ts -t "includes isActive"`
Expected: FAIL - thresholdLimitService not in deps type

**Step 3: Update ThresholdRouteDeps and implementation**

In `src/api/routes/thresholds.ts`:

```typescript
// Add import
import type { ThresholdLimitService } from "@/billing/threshold-limit-service";

// Update interface
export interface ThresholdRouteDeps {
  thresholdRepo?: ThresholdRepository | undefined;
  authMiddleware?: AuthMiddleware | undefined;
  thresholdLimitService?: ThresholdLimitService | undefined;
}

// In GET handler, after fetching thresholds (around line 78-100):
if (authContext && deps.thresholdRepo) {
  const paginatedThresholds = await deps.thresholdRepo.getByUserPaginated(
    authContext.userId,
    { limit, offset }
  );

  // Get active threshold IDs from limit service
  let activeIds: Set<string> = new Set();
  if (deps.thresholdLimitService) {
    activeIds = await deps.thresholdLimitService.getActiveThresholdIds(authContext.userId);
  }

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
    isActive: deps.thresholdLimitService ? activeIds.has(t.id) : true,
  }));

  return jsonWithCors({
    data: apiThresholds,
    pagination: paginatedThresholds.pagination,
  });
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/api/routes/thresholds.test.ts -t "includes isActive"`
Expected: PASS

**Step 5: Wire up thresholdLimitService in server**

In `src/server.ts`, find where thresholdRoutes is created and add thresholdLimitService:

```typescript
// Find the serverDeps.thresholdLimitService (already exists from backend work)
// Pass it to createThresholdRoutes
const thresholdRoutes = createThresholdRoutes({
  thresholdRepo: deps.thresholdRepo,
  authMiddleware: deps.authMiddleware,
  thresholdLimitService: deps.thresholdLimitService,
});
```

**Step 6: Run all thresholds tests**

Run: `bun test tests/unit/api/routes/thresholds.test.ts`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/api/routes/thresholds.ts src/server.ts tests/unit/api/routes/thresholds.test.ts
git commit -m "feat(api): add isActive field to thresholds response"
```

---

## Task 2: Add getLimits API Client Method

**Files:**
- Modify: `src/frontend/api/client.ts`
- Modify: `src/frontend/types/index.ts`

**Step 1: Add LimitInfo type**

In `src/frontend/types/index.ts`, add:

```typescript
export interface LimitInfo {
  plan: "FREE" | "PRO";
  thresholds: {
    current: number;
    max: number | null; // null = unlimited
    remaining: number | null;
    isOverLimit: boolean;
  };
}
```

**Step 2: Add isActive to Threshold type**

In `src/frontend/types/index.ts`, update Threshold interface:

```typescript
export interface Threshold {
  id: string;
  productId: string;
  productName: string;
  minQuantity: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean; // Add this
}
```

**Step 3: Add getLimits function to API client**

In `src/frontend/api/client.ts`, add:

```typescript
// Import LimitInfo type
import type { LimitInfo } from "../types";

// Add function
async function getLimits(): Promise<LimitInfo> {
  return request<LimitInfo>("/settings/limits");
}

// Add to api export object
export const api = {
  // ... existing methods
  getLimits,
};
```

**Step 4: Commit**

```bash
git add src/frontend/api/client.ts src/frontend/types/index.ts
git commit -m "feat(frontend): add getLimits API method and types"
```

---

## Task 3: Add Usage Header to Thresholds Page

**Files:**
- Modify: `src/frontend/pages/Thresholds.tsx`

**Step 1: Add state for limits**

```typescript
const [limits, setLimits] = useState<LimitInfo | null>(null);
```

**Step 2: Fetch limits alongside thresholds**

Update the useEffect:

```typescript
useEffect(() => {
  async function loadData() {
    try {
      setLoading(true);
      const [thresholdsData, productsData, limitsData] = await Promise.all([
        api.getThresholds(),
        api.getProducts(),
        api.getLimits(),
      ]);
      setThresholds(thresholdsData.thresholds);
      setProducts(productsData.products);
      setLimits(limitsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }
  loadData();
}, []);
```

**Step 3: Add usage count to header**

Replace the card-header section:

```typescript
<div className="card-header">
  <div>
    <h2 className="card-title">Umbrales de Alerta</h2>
    {limits && (
      <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
        {limits.thresholds.max !== null
          ? `Usando ${limits.thresholds.current} de ${limits.thresholds.max} umbrales`
          : `Usando ${limits.thresholds.current} umbrales`}
      </p>
    )}
  </div>
  <button className="btn btn-primary" onClick={handleCreate} type="button">
    + Nuevo Umbral
  </button>
</div>
```

**Step 4: Verify manually**

Run: `bun run dev` and navigate to /thresholds
Expected: See "Usando X de 50 umbrales" subtitle

**Step 5: Commit**

```bash
git add src/frontend/pages/Thresholds.tsx
git commit -m "feat(frontend): add usage count header to thresholds page"
```

---

## Task 4: Add Limit Banners to Thresholds Page

**Files:**
- Modify: `src/frontend/pages/Thresholds.tsx`

**Step 1: Add banner dismissal state and localStorage logic**

```typescript
const BANNER_DISMISS_KEY = "limitBannerDismissedAt";
const BANNER_DISMISS_DAYS = 7;

function shouldShowOverLimitBanner(): boolean {
  if (!limits || !limits.thresholds.isOverLimit) return false;

  const dismissedAt = localStorage.getItem(BANNER_DISMISS_KEY);
  if (!dismissedAt) return true;

  const dismissDate = new Date(dismissedAt);
  const daysSince = (Date.now() - dismissDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= BANNER_DISMISS_DAYS;
}

function handleDismissBanner() {
  localStorage.setItem(BANNER_DISMISS_KEY, new Date().toISOString());
  // Force re-render
  setLimits({ ...limits! });
}
```

**Step 2: Add banner components after card-header**

```typescript
{/* Approaching limit banner (40-49) */}
{limits && limits.thresholds.max !== null &&
 limits.thresholds.current >= 40 &&
 limits.thresholds.current < 50 && (
  <div style={{
    backgroundColor: "#fef3c7",
    padding: "0.75rem 1rem",
    borderRadius: "0.375rem",
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem"
  }}>
    <span style={{ color: "#92400e" }}>
      Te estas acercando a tu limite gratuito de {limits.thresholds.max} umbrales.
    </span>
    <a href="/settings" style={{ color: "#92400e", fontWeight: 500 }}>
      Actualizar a Pro
    </a>
  </div>
)}

{/* Over limit banner (50+) */}
{shouldShowOverLimitBanner() && limits && (
  <div style={{
    backgroundColor: "#fee2e2",
    padding: "0.75rem 1rem",
    borderRadius: "0.375rem",
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ color: "#991b1b" }}>
        {limits.thresholds.current - (limits.thresholds.max ?? 0)} umbrales estan inactivos.
      </span>
      <a href="/settings" style={{ color: "#991b1b", fontWeight: 500 }}>
        Actualiza a Pro para alertas ilimitadas
      </a>
    </div>
    <button
      onClick={handleDismissBanner}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#991b1b",
        fontSize: "1.25rem",
        lineHeight: 1
      }}
      type="button"
      aria-label="Cerrar"
    >
      &times;
    </button>
  </div>
)}
```

**Step 3: Verify manually**

Run: `bun run dev`
Expected: Banner appears when approaching/over limit, dismissal persists in localStorage

**Step 4: Commit**

```bash
git add src/frontend/pages/Thresholds.tsx
git commit -m "feat(frontend): add approaching/over limit banners with dismissal"
```

---

## Task 5: Add Inactive Badge to Threshold Rows

**Files:**
- Modify: `src/frontend/pages/Thresholds.tsx`

**Step 1: Update table row rendering**

In the threshold map, update the status cell and add inactive styling:

```typescript
{thresholds.map((threshold) => {
  const product = products.find((p) => p.id === threshold.productId);
  const isBelowThreshold = product && product.currentStock <= threshold.minQuantity;
  const isInactive = !threshold.isActive;

  return (
    <tr key={threshold.id} style={isInactive ? { opacity: 0.6 } : undefined}>
      <td>{sanitizeText(threshold.productName)}</td>
      <td>
        <strong>{threshold.minQuantity.toLocaleString()}</strong>
      </td>
      <td>{product?.currentStock.toLocaleString() ?? "-"}</td>
      <td>
        {isInactive ? (
          <span className="badge badge-secondary" title="Actualiza a Pro para activar">
            Inactivo
          </span>
        ) : (
          <span className={`badge ${isBelowThreshold ? "badge-danger" : "badge-success"}`}>
            {isBelowThreshold ? "Alerta" : "OK"}
          </span>
        )}
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleEdit(threshold)}
            type="button"
          >
            Editar
          </button>
          <button
            className="btn btn-danger"
            onClick={() => handleDeleteClick(threshold.id)}
            type="button"
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  );
})}
```

**Step 2: Verify manually**

Run: `bun run dev`
Expected: Inactive thresholds show muted row with "Inactivo" badge

**Step 3: Commit**

```bash
git add src/frontend/pages/Thresholds.tsx
git commit -m "feat(frontend): add inactive badge and styling to threshold rows"
```

---

## Task 6: Add Warning in Threshold Creation Modal

**Files:**
- Modify: `src/frontend/pages/Thresholds.tsx`

**Step 1: Pass limits to ThresholdModal**

Update the modal call:

```typescript
{showModal && (
  <ThresholdModal
    threshold={editingThreshold}
    products={products}
    limits={limits}
    onSave={handleSave}
    onClose={() => setShowModal(false)}
  />
)}
```

**Step 2: Update ThresholdModalProps interface**

```typescript
interface ThresholdModalProps {
  threshold: Threshold | null;
  products: Product[];
  limits: LimitInfo | null;
  onSave: (data: ThresholdFormData) => void;
  onClose: () => void;
}
```

**Step 3: Add warning in modal**

Update the ThresholdModal function:

```typescript
function ThresholdModal({ threshold, products, limits, onSave, onClose }: ThresholdModalProps) {
  const [productId, setProductId] = useState(threshold?.productId ?? "");
  const [minQuantity, setMinQuantity] = useState(threshold?.minQuantity ?? 10);

  // Show warning if creating new threshold and over limit
  const showLimitWarning = !threshold && limits && limits.thresholds.isOverLimit;

  // ... rest of component

  return (
    <div style={{ /* modal styles */ }}>
      <div className="card" style={{ width: "100%", maxWidth: "400px" }}>
        <div className="card-header">
          <h2 className="card-title">{threshold ? "Editar Umbral" : "Nuevo Umbral"}</h2>
          <button className="btn btn-secondary" onClick={onClose} type="button">X</button>
        </div>
        <form onSubmit={handleSubmit}>
          {showLimitWarning && (
            <div style={{
              backgroundColor: "#fef3c7",
              padding: "0.75rem",
              borderRadius: "0.375rem",
              marginBottom: "1rem",
              fontSize: "0.875rem",
              color: "#92400e"
            }}>
              Este umbral no generara alertas hasta que actualices a Pro.
            </div>
          )}
          {/* rest of form */}
        </form>
      </div>
    </div>
  );
}
```

**Step 4: Verify manually**

Run: `bun run dev`
Expected: Warning shows when creating threshold while over limit

**Step 5: Commit**

```bash
git add src/frontend/pages/Thresholds.tsx
git commit -m "feat(frontend): add warning in creation modal when over limit"
```

---

## Task 7: Add Usage Meter to Settings Page

**Files:**
- Modify: `src/frontend/pages/Settings.tsx`

**Step 1: Add limits state and fetch**

```typescript
import type { LimitInfo } from "../types";

// Add state
const [limits, setLimits] = useState<LimitInfo | null>(null);

// Update loadSettings to also fetch limits
useEffect(() => {
  async function loadSettings() {
    try {
      setLoading(true);
      const [data, limitsData] = await Promise.all([
        api.getSettings(),
        api.getLimits(),
      ]);
      setSettings(data);
      setLimits(limitsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar configuracion");
    } finally {
      setLoading(false);
    }
  }
  loadSettings();
}, []);
```

**Step 2: Add usage meter to subscription card**

Update the Suscripcion card section:

```typescript
<div className="card" style={{ marginBottom: "1.5rem" }}>
  <div className="card-header">
    <h2 className="card-title">Suscripcion</h2>
  </div>

  {/* Plan status */}
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
    <div>
      <div className="form-label">Plan Actual</div>
      <span className={`badge ${settings.subscriptionStatus === "active" ? "badge-success" : "badge-warning"}`}>
        {settings.subscriptionStatus === "active" ? "Plan Pro" : "Plan Gratuito"}
      </span>
    </div>
    {settings.subscriptionStatus === "active" ? (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleCancelSubscription}
        disabled={billingLoading}
      >
        {billingLoading ? "Cargando..." : "Cancelar Suscripcion"}
      </button>
    ) : (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setUpgradeConfirm(true)}
        disabled={billingLoading}
      >
        {billingLoading ? "Cargando..." : "Actualizar a Pro"}
      </button>
    )}
  </div>

  {/* Usage meter */}
  {limits && (
    <div style={{ marginBottom: "1rem" }}>
      <div className="form-label">Uso de Umbrales</div>
      {limits.thresholds.max !== null ? (
        <>
          <div style={{
            backgroundColor: "#e2e8f0",
            borderRadius: "9999px",
            height: "0.5rem",
            overflow: "hidden",
            marginBottom: "0.5rem"
          }}>
            <div style={{
              backgroundColor: limits.thresholds.isOverLimit ? "#ef4444" : "#3b82f6",
              height: "100%",
              width: `${Math.min((limits.thresholds.current / limits.thresholds.max) * 100, 100)}%`,
              transition: "width 0.3s ease"
            }} />
          </div>
          <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
            {limits.thresholds.current} de {limits.thresholds.max} umbrales (en todas tus cuentas)
          </div>
        </>
      ) : (
        <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
          Umbrales ilimitados
        </div>
      )}
    </div>
  )}

  {settings.subscriptionStatus !== "active" && (
    <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
      Actualiza a Pro para acceder a alertas ilimitadas, sincronizacion cada hora y soporte prioritario.
    </p>
  )}
</div>
```

**Step 3: Verify manually**

Run: `bun run dev` and navigate to /settings
Expected: Usage meter shows with progress bar for free users, "Umbrales ilimitados" for pro

**Step 4: Commit**

```bash
git add src/frontend/pages/Settings.tsx
git commit -m "feat(frontend): add usage meter to settings subscription card"
```

---

## Task 8: Final Verification

**Step 1: Type check**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 2: Lint**

Run: `bunx eslint src/frontend`
Expected: No errors

**Step 3: Run all tests**

Run: `bun test tests/unit`
Expected: All tests pass

**Step 4: Manual E2E verification**

1. Navigate to /thresholds - see usage count in header
2. If near limit (40-49), see approaching banner
3. If over limit (50+), see over-limit banner with dismiss
4. Inactive thresholds show muted with "Inactivo" badge
5. Create new threshold when over limit - see warning
6. Navigate to /settings - see usage meter with progress bar
7. Dismiss banner, refresh - banner stays hidden
8. Wait 7 days (or modify localStorage) - banner reappears

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues from final verification"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add isActive to thresholds API response |
| 2 | Add getLimits API client method and types |
| 3 | Add usage header to thresholds page |
| 4 | Add limit banners with dismissal |
| 5 | Add inactive badge to threshold rows |
| 6 | Add warning in creation modal |
| 7 | Add usage meter to settings page |
| 8 | Final verification |
