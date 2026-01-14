# MercadoPago Migration - Next Steps

## Context

The MercadoPago billing migration is complete. PR #104 contains:
- Database migration for subscription columns
- E2E testing documentation
- Stripe cleanup

**E2E Testing Verified:**
- Preapproval creation ✅
- Checkout flow ✅
- Subscription status → `authorized` ✅
- `external_reference` preserved ✅

## Webhook Configuration (Done by User)

Enabled topics in MercadoPago dashboard:
- Pagos (payments)
- Planes y suscripciones (subscription_preapproval)
- Vinculación de aplicaciones
- Reclamos

## Remaining Tasks

### 1. Webhook Integration Tests (High Priority)

MercadoPago provides a "Simulate notification" button in the dashboard. Create integration tests that:

1. Start local server
2. Use reverse proxy (ngrok/localtunnel) to expose webhook endpoint
3. Trigger simulated webhook from MercadoPago
4. Verify database state changes

**Files to create:**
```
tests/integration/billing/webhook.integration.test.ts
```

**Test scenarios:**
- `subscription_preapproval` with status `authorized` → activates subscription
- `subscription_preapproval` with status `cancelled` → deactivates subscription
- Invalid signature → returns 401
- Unknown event type → returns 200 (ignored)

**Approach:**
```typescript
// Use MercadoPago MCP tool to simulate webhook
// mcp__mercadopago__simulate_webhook({
//   topic: "subscription_preapproval",
//   resource_id: "<preapproval_id>",
//   callback_env_production: false  // use sandbox URL
// })
```

### 2. Production Secrets Setup ✅ DONE

Added to 1Password Dev vault:
- `MERCADOPAGO_ACCESS_TOKEN` ✅
- `MERCADOPAGO_PUBLIC_KEY` ✅
- `MERCADOPAGO_CLIENT_ID` ✅
- `MERCADOPAGO_CLIENT_SECRET` ✅
- `MERCADOPAGO_WEBHOOK_SECRET` ✅

`.env.tpl` updated with all references.

### 3. Database Migration

Run in production:
```bash
bun db:migrate
```

Migration file: `src/db/migrations/004_mercadopago_billing.sql`

### 4. Production Webhook URL

Configure in MercadoPago dashboard:
- **Production URL:** `https://aiskualerts.com/api/webhooks/mercadopago`
- **Topics:** `subscription_preapproval` (already enabled)

### 5. End-to-End Production Test

After deployment:
1. Create a real subscription (can refund immediately)
2. Verify webhook received and processed
3. Check database: `subscription_status = 'active'`
4. Test cancellation flow

## Test Credentials Reference

**Test Seller (for sandbox):**
- Has own MercadoPago application
- Use seller's access token to create preapprovals

**Test Buyer (for sandbox):**
- Username format: `TESTUSER<numbers>`
- Email format: `test_user_<numbers>@testuser.com`

**Test Cards (Chile/MLC):**
| Card | Number |
|------|--------|
| Mastercard | 5416 7526 0258 2580 |
| Visa | 4168 8188 4444 7115 |

CVV: 123, Expiry: 11/30, Cardholder: `APRO`

## Key Files

| File | Purpose |
|------|---------|
| `src/billing/mercadopago.ts` | MercadoPago client |
| `src/api/handlers/billing.ts` | Checkout, cancel, webhook handlers |
| `src/db/repositories/tenant.ts` | `activateSubscription`, `updateSubscriptionStatus` |
| `docs/BILLING.md` | E2E testing guide |
| `tests/unit/billing/mercadopago.test.ts` | Unit tests (100% coverage) |

## MCP Tools Available

```
mcp__mercadopago__simulate_webhook     - Simulate webhook notification
mcp__mercadopago__notifications_history - Check webhook delivery status
mcp__mercadopago__save_webhook         - Configure webhook URL
mcp__mercadopago__quality_evaluation   - Evaluate integration quality
mcp__mercadopago__search_documentation - Search MercadoPago docs
```

## Important Notes

1. **Sandbox requires both test accounts** - seller AND buyer must be test users
2. **Email format matters** - `test_user_<numbers>@testuser.com`
3. **Webhook signature validation** - Set `MERCADOPAGO_WEBHOOK_SECRET` in production
4. **Grace period** - Cancelled subscriptions remain active until `subscription_ends_at`
