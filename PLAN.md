# Development Plan & Workflow

## PR Workflow (MANDATORY)

When creating or updating a Pull Request, Claude MUST follow this workflow:

### 1. After Creating/Updating a PR
- **Always wait for CI checks** using `gh pr checks <PR#> --watch`
- Do not proceed until all checks pass
- If checks fail, fix the issues and push again

### 2. Review Cycle
- After CI passes, check for reviewer comments: `gh pr view <PR#> --comments`
- If reviewer requests changes:
  1. Read and understand all comments
  2. Address each comment with code changes
  3. Commit and push the fixes
  4. Wait for CI checks again with `gh pr checks <PR#> --watch`
  5. Repeat until reviewer approves

### 3. Merge Criteria
- All CI checks must pass
- Reviewer must have approved (no pending "changes requested")
- Only then ask user if they want to merge

### Example Commands
```bash
# Watch CI checks (blocks until complete)
gh pr checks 25 --watch

# View PR comments
gh pr view 25 --comments

# Check review status
gh pr view 25 --json reviews

# After fixing, push and re-check
git push && gh pr checks 25 --watch
```

---

# Migration Plan: Stripe → MercadoPago

## Summary

Replace Stripe with MercadoPago for subscription billing using the **PreApproval API** (subscriptions without associated plan). This approach gives us full control over subscription parameters.

## Decisions

| Decision | Choice |
|----------|--------|
| **Subscription price** | $9,990 CLP/month |
| **Migration strategy** | Clean replacement (no existing users) |
| **Cancellation behavior** | Access continues until end of current billing period |
| **Database columns** | Generic names (provider-agnostic) |

---

## MercadoPago API Reference

### PreApproval API (Subscriptions)

**Endpoint:** `POST https://api.mercadopago.com/preapproval`

**SDK Client:** `PreApproval` from `mercadopago` package

**Methods:**
- `create()` - Create new subscription
- `get()` - Get subscription details
- `update()` - Update subscription (status, amount, etc.)
- `search()` - Search subscriptions

### Request Body (Create Subscription)

```typescript
{
  reason: string;              // Description shown to user
  external_reference: string;  // Our tenant_id
  payer_email: string;         // User's email
  auto_recurring: {
    frequency: number;         // 1
    frequency_type: string;    // "months"
    transaction_amount: number; // 9990
    currency_id: string;       // "CLP"
  };
  back_url: string;            // Redirect after payment
  status: string;              // "pending" (user must authorize)
}
```

### Response

```typescript
{
  id: string;                  // Preapproval ID (subscription ID)
  init_point: string;          // Checkout URL to redirect user
  status: string;              // "pending" | "authorized" | "paused" | "cancelled"
  external_reference: string;  // Our tenant_id
  next_payment_date: string;   // ISO date
  // ... more fields
}
```

### Subscription Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting user authorization |
| `authorized` | Active, will charge automatically |
| `paused` | Temporarily stopped, no charges |
| `cancelled` | Permanently stopped |

### Webhook Events

**Topic:** `subscription_preapproval`

**Webhook Payload:**
```typescript
{
  type: string;      // "subscription_preapproval"
  data: { id: string }  // Preapproval ID
}
```

**Headers:**
- `x-signature`: `ts=timestamp,v1=hash`
- `x-request-id`: Request ID

**Signature Validation:**
```typescript
const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
const hash = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
// Compare with v1 from x-signature
```

---

## MCP Server Tools (Development & Testing)

**Application:** `aiskualerts` (ID: `4191427937807674`)

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__mercadopago__application_list` | List your MercadoPago applications |
| `mcp__mercadopago__search_documentation` | Search MercadoPago developer docs (use `siteId: "MLC"` for Chile) |
| `mcp__mercadopago__save_webhook` | Configure webhook endpoints (production & sandbox URLs) |
| `mcp__mercadopago__simulate_webhook` | Test webhooks with simulated events |
| `mcp__mercadopago__notifications_history` | View webhook delivery history and diagnose issues |
| `mcp__mercadopago__create_test_user` | Create sandbox test users (seller/buyer) |
| `mcp__mercadopago__add_money_test_user` | Add funds to test accounts |
| `mcp__mercadopago__quality_checklist` | Check integration quality requirements |
| `mcp__mercadopago__quality_evaluation` | Evaluate a specific payment by ID |

### Webhook Topics for Subscriptions

Configure these topics when setting up webhooks:
- `subscription_preapproval` - Subscription status changes (authorized, paused, cancelled)
- `subscription_preapproval_plan` - Plan modifications
- `subscription_authorized_payment` - Authorized recurring payments

### Testing Workflow

1. **Configure webhook URL:**
   ```
   mcp__mercadopago__save_webhook(
     callback_sandbox: "https://your-ngrok-url/api/webhooks/mercadopago",
     topics: ["subscription_preapproval", "subscription_authorized_payment"]
   )
   ```

2. **Simulate webhook event:**
   ```
   mcp__mercadopago__simulate_webhook(
     resource_id: "preapproval_id",
     topic: "subscription_preapproval",
     callback_env_production: false
   )
   ```

3. **Check delivery history:**
   ```
   mcp__mercadopago__notifications_history()
   ```

### Sandbox Test Users

Two test users have been created:
- **Seller account** - For receiving payments
- **Buyer account** - For making test purchases

Use `mcp__mercadopago__add_money_test_user` to add funds to the buyer account for testing.

---

## Database Schema (Generic Columns)

### Current (Stripe-specific)
```sql
stripe_customer_id TEXT UNIQUE,
is_paid BOOLEAN DEFAULT FALSE,
```

### New (Provider-agnostic)
```sql
-- Billing fields (provider-agnostic)
subscription_id TEXT UNIQUE,           -- Provider's subscription/customer ID
subscription_status TEXT DEFAULT 'none', -- none | active | cancelled | past_due
subscription_ends_at TIMESTAMPTZ,      -- When current period ends (for grace period)
```

**Status Values:**
| Status | Description |
|--------|-------------|
| `none` | No subscription |
| `active` | Subscription is active |
| `cancelled` | Cancelled but still in grace period |
| `past_due` | Payment failed, awaiting retry |

---

## Implementation Steps

### Step 0: Fix Pre-existing Errors

Fix TypeScript and ESLint errors before migration:

| File | Issue | Fix |
|------|-------|-----|
| `src/api/routes/utils.ts:66` | Type coercion | Use `?? null` instead of undefined |
| `src/api/routes/utils.ts:40` | Dot notation | Use `process.env.NODE_ENV` |
| `src/server.ts:212` | Unnecessary conditional | Remove `??` |
| Multiple test files | Missing `allowedOrigins` | Add `allowedOrigins: []` |
| `tests/unit/server.test.ts:1086` | Duplicate property | Remove duplicate |

---

### Step 1: Update Dependencies

```bash
bun remove stripe && bun add mercadopago
```

---

### Step 2: Update Configuration

**File:** `src/config.ts`

**Remove:**
```typescript
stripeSecretKey?: string;
stripePriceId?: string;
stripeWebhookSecret?: string;
```

**Add:**
```typescript
mercadoPagoAccessToken?: string;
mercadoPagoWebhookSecret?: string;
mercadoPagoPlanAmount: number;      // Default: 9990
mercadoPagoPlanCurrency: string;    // Default: "CLP"
```

**Environment Variables:**
```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxx
MERCADOPAGO_WEBHOOK_SECRET=xxx
MERCADOPAGO_PLAN_AMOUNT=9990
MERCADOPAGO_PLAN_CURRENCY=CLP
```

---

### Step 3: Create MercadoPago Client

**File:** `src/billing/mercadopago.ts` (replace `stripe.ts`)

```typescript
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import crypto from "crypto";
import { z } from "zod";

const ConfigSchema = z.object({
  accessToken: z.string().min(1),
  webhookSecret: z.string().min(1).optional(),
  planAmount: z.number().positive(),
  planCurrency: z.string().length(3),
  appUrl: z.string().url(),
});

export type MercadoPagoClientConfig = z.infer<typeof ConfigSchema>;

export type WebhookResult =
  | { type: "subscription_authorized"; subscriptionId: string; tenantId: string }
  | { type: "subscription_cancelled"; subscriptionId: string; tenantId: string }
  | { type: "ignored"; eventType: string };

export class MercadoPagoClient {
  private client: MercadoPagoConfig;
  private preapproval: PreApproval;
  private config: MercadoPagoClientConfig;

  constructor(config: MercadoPagoClientConfig) {
    this.config = ConfigSchema.parse(config);
    this.client = new MercadoPagoConfig({
      accessToken: this.config.accessToken,
      options: { timeout: 5000 },
    });
    this.preapproval = new PreApproval(this.client);
  }

  async createSubscription(tenantId: string, email: string): Promise<string> {
    const response = await this.preapproval.create({
      body: {
        reason: "AISku Alerts Pro",
        external_reference: tenantId,
        payer_email: email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: this.config.planAmount,
          currency_id: this.config.planCurrency,
        },
        back_url: `${this.config.appUrl}/billing/success`,
      },
    });

    if (!response.init_point) {
      throw new Error("MercadoPago did not return checkout URL");
    }

    return response.init_point;
  }

  async cancelSubscription(subscriptionId: string): Promise<Date> {
    const current = await this.preapproval.get({ id: subscriptionId });

    await this.preapproval.update({
      id: subscriptionId,
      body: { status: "cancelled" },
    });

    // Return next_payment_date as the end of the current period
    return new Date(current.next_payment_date ?? Date.now());
  }

  validateWebhookSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string
  ): boolean {
    if (!this.config.webhookSecret) {
      throw new Error("Webhook secret not configured");
    }

    const parts = xSignature.split(",");
    let ts = "";
    let hash = "";

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key?.trim() === "ts") ts = value?.trim() ?? "";
      if (key?.trim() === "v1") hash = value?.trim() ?? "";
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const computed = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(manifest)
      .digest("hex");

    return computed === hash;
  }

  async processWebhookEvent(type: string, dataId: string): Promise<WebhookResult> {
    if (type !== "subscription_preapproval") {
      return { type: "ignored", eventType: type };
    }

    const preapproval = await this.preapproval.get({ id: dataId });
    const tenantId = preapproval.external_reference;

    if (!tenantId) {
      throw new Error("Missing external_reference in preapproval");
    }

    if (preapproval.status === "authorized") {
      return {
        type: "subscription_authorized",
        subscriptionId: preapproval.id!,
        tenantId,
      };
    }

    if (preapproval.status === "cancelled" || preapproval.status === "paused") {
      return {
        type: "subscription_cancelled",
        subscriptionId: preapproval.id!,
        tenantId,
      };
    }

    return { type: "ignored", eventType: `preapproval_${preapproval.status}` };
  }
}
```

---

### Step 4: Update Database Schema

**File:** `src/db/schema.sql`

```sql
-- Replace Stripe-specific columns with generic ones
ALTER TABLE tenants DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS is_paid;

ALTER TABLE tenants ADD COLUMN subscription_id TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN subscription_status TEXT DEFAULT 'none';
ALTER TABLE tenants ADD COLUMN subscription_ends_at TIMESTAMPTZ;

-- Update index
DROP INDEX IF EXISTS idx_tenants_stripe_customer;
CREATE INDEX idx_tenants_subscription ON tenants(subscription_id)
  WHERE subscription_id IS NOT NULL;
```

---

### Step 5: Update Types

**File:** `src/db/repositories/types.ts`

```typescript
export type SubscriptionStatus = "none" | "active" | "cancelled" | "past_due";

export interface Tenant {
  id: string;
  bsale_client_code: string;
  bsale_client_name: string;
  bsale_access_token: string;
  sync_status: SyncStatus;
  last_sync_at: Date | null;
  // Billing (generic)
  subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
```

**Helper function:**
```typescript
export function isTenantPaid(tenant: Tenant): boolean {
  if (tenant.subscription_status === "active") return true;
  if (tenant.subscription_status === "cancelled" && tenant.subscription_ends_at) {
    return tenant.subscription_ends_at > new Date();
  }
  return false;
}
```

---

### Step 6: Update Repository Methods

**File:** `src/db/repositories/tenant.ts`

| Old Method | New Method |
|------------|------------|
| `findByStripeCustomerId(id)` | `findBySubscriptionId(id)` |
| `updateStripeCustomer(tenantId, customerId)` | `activateSubscription(tenantId, subscriptionId)` |
| `updatePaidStatus(customerId, isPaid)` | `updateSubscriptionStatus(subscriptionId, status, endsAt?)` |

```typescript
async findBySubscriptionId(subscriptionId: string): Promise<Tenant | null> {
  return this.db.queryOne<Tenant>(
    `SELECT * FROM tenants WHERE subscription_id = $1`,
    [subscriptionId]
  );
}

async activateSubscription(tenantId: string, subscriptionId: string): Promise<void> {
  await this.db.execute(
    `UPDATE tenants
     SET subscription_id = $1, subscription_status = 'active',
         subscription_ends_at = NULL, updated_at = NOW()
     WHERE id = $2`,
    [subscriptionId, tenantId]
  );
}

async updateSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
  endsAt?: Date
): Promise<void> {
  await this.db.execute(
    `UPDATE tenants
     SET subscription_status = $1, subscription_ends_at = $2, updated_at = NOW()
     WHERE subscription_id = $3`,
    [status, endsAt?.toISOString() ?? null, subscriptionId]
  );
}
```

---

### Step 7: Update Billing Handlers

**File:** `src/api/handlers/billing.ts`

```typescript
import type { MercadoPagoClient } from "@/billing/mercadopago";

export interface BillingHandlerDeps {
  mercadoPagoClient: MercadoPagoClient;
  tenantRepo: TenantRepository;
  userRepo: UserRepository;
  authMiddleware: AuthMiddleware;
}

export interface BillingRoutes {
  checkout: (req: Request) => Promise<Response>;
  cancel: (req: Request) => Promise<Response>;  // Replaces portal
  webhook: (req: Request) => Promise<Response>;
}
```

**Webhook Handler Changes:**
- Read `x-signature` and `x-request-id` headers
- Parse JSON body for `type` and `data.id`
- Validate signature
- Process event
- Return 200 OK (MercadoPago requirement)

---

### Step 8: Update Server Routes

**File:** `src/server.ts`

| Old Route | New Route |
|-----------|-----------|
| `POST /api/billing/checkout` | `POST /api/billing/checkout` (same) |
| `POST /api/billing/portal` | `POST /api/billing/cancel` |
| `POST /api/webhooks/stripe` | `POST /api/webhooks/mercadopago` |

---

### Step 9: Update Frontend

**File:** `src/frontend/pages/Settings.tsx`

1. Update URL validation for MercadoPago domains
2. Replace "Gestionar Suscripcion" with "Cancelar Suscripcion"
3. Add confirmation dialog before cancellation

```typescript
function isValidMercadoPagoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname.endsWith(".mercadopago.com") ||
       parsed.hostname.endsWith(".mercadopago.cl") ||
       parsed.hostname.endsWith(".mercadolibre.com"))
    );
  } catch {
    return false;
  }
}
```

**File:** `src/frontend/api/client.ts`

- Keep `createCheckoutSession()` (same interface)
- Replace `createPortalSession()` with `cancelSubscription()`

**File:** `src/frontend/types.ts`

```typescript
interface TenantSettings {
  subscriptionStatus: "none" | "active" | "cancelled" | "past_due";
  subscriptionEndsAt: string | null;
}
```

---

### Step 10: Update Monitoring

**File:** `src/monitoring/sentry.ts`

- Rename `traceStripeApi` → `tracePaymentApi`
- Update metric names: `stripe.*` → `billing.*`

---

### Step 11: Update Tests

| Test File | Changes |
|-----------|---------|
| `tests/unit/billing/stripe.test.ts` | Delete, create `mercadopago.test.ts` |
| `tests/unit/api/handlers/billing.test.ts` | Update mocks for MercadoPago |
| `tests/helpers/config.ts` | Update config helpers |

---

## Files to Modify

**Fix existing errors:**
1. `src/api/routes/utils.ts` - Type coercion + dot notation
2. `src/server.ts` - Remove unnecessary conditional
3. `tests/integration/sync-to-email-flow.test.ts`
4. `tests/unit/api/handlers/sync.test.ts`
5. `tests/unit/email/resend-client.test.ts`
6. `tests/unit/jobs/digest-job.test.ts`
7. `tests/unit/jobs/sync-job-extended.test.ts`
8. `tests/unit/jobs/sync-job.test.ts`
9. `tests/unit/server.test.ts`

**Migration:**
1. `package.json` - Dependencies
2. `src/config.ts` - Config schema
3. `src/billing/stripe.ts` → `src/billing/mercadopago.ts`
4. `src/db/schema.sql` - Schema changes
5. `src/db/repositories/types.ts` - Types
6. `src/db/repositories/tenant.ts` - Repository methods
7. `src/api/handlers/billing.ts` - Handlers
8. `src/server.ts` - Routes
9. `src/index.ts` - Initialization
10. `src/monitoring/sentry.ts` - Metrics
11. `src/frontend/pages/Settings.tsx` - UI
12. `src/frontend/api/client.ts` - API client
13. `src/frontend/types.ts` - Types
14. `tests/unit/billing/mercadopago.test.ts` - New tests
15. `tests/unit/api/handlers/billing.test.ts` - Updated tests

---

## Verification

1. `tsc --noEmit` - No type errors
2. `bun run lint` - No lint errors
3. `bun test` - All tests pass
4. Manual test with MercadoPago sandbox:
   - Create subscription → Redirected to MercadoPago
   - Complete payment → Webhook fires → `subscription_status = 'active'`
   - Cancel → `subscription_status = 'cancelled'`, `subscription_ends_at` set
   - After period ends → Access revoked

---

## Sources

- [MercadoPago Node.js SDK](https://github.com/mercadopago/sdk-nodejs)
- [MercadoPago PreApproval API Reference](https://www.mercadopago.cl/developers/en/reference/subscriptions/_preapproval/post)
- [MercadoPago Webhooks Documentation](https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks)
- [MercadoPago Subscriptions Overview](https://www.mercadopago.cl/developers/es/docs/subscriptions/landing)
