# MercadoPago Billing Integration

## Overview

AIskuAlerts uses MercadoPago for subscription billing. This document covers:
- Environment configuration
- E2E testing with sandbox
- Production deployment checklist
- Webhook configuration

## Configuration

### Environment Variables

```bash
# Required
MERCADOPAGO_ACCESS_TOKEN=       # Your MercadoPago access token

# Optional (recommended for production)
MERCADOPAGO_WEBHOOK_SECRET=     # For webhook signature validation

# Plan configuration
MERCADOPAGO_PLAN_AMOUNT=9990    # Amount in minor units (9990 = $99.90)
MERCADOPAGO_PLAN_CURRENCY=CLP   # Currency code

# Application URL (required for webhooks)
APP_URL=https://your-domain.com
```

### Getting Credentials

1. **Access Token:**
   - Go to [MercadoPago Developers](https://www.mercadopago.cl/developers)
   - Navigate to: Your applications > aiskualerts > Credentials
   - Copy the **Access Token** (use Test credentials for sandbox)

2. **Webhook Secret:**
   - Navigate to: Your applications > aiskualerts > Webhooks
   - Create or view webhook configuration
   - The secret is generated when you set up webhooks

## E2E Testing (Sandbox)

### Critical: Test Account Requirements

> **Important:** In sandbox mode, **both seller AND buyer must be test accounts**.
> You cannot mix a real account with a test account - MercadoPago will reject the payment with:
> "Una de las partes con la que intentas hacer el pago es de prueba"

### Setup Overview

You need:
1. **Test Seller Account** - with its own application and access token
2. **Test Buyer Account** - to complete the checkout flow

### Step 1: Create Test Users

Test users must be created via the MercadoPago dashboard (API creation is restricted by policy):

1. Go to [MercadoPago Developers](https://www.mercadopago.cl/developers)
2. Navigate to your application → "Cuentas de prueba"
3. Click "Crear cuenta de prueba"
4. Create two accounts for MLC (Chile):
   - **Seller** account (profile: Vendedor)
   - **Buyer** account (profile: Comprador)
5. Save the username and password for each

### Step 2: Create Application for Test Seller

The test seller needs its own application to generate access tokens:

1. Log in to MercadoPago Developers with the **test seller** credentials
2. Create a new application
3. Get the **Access Token** from Credentials

### Step 3: Create Preapproval with Test Seller Token

```bash
curl -X POST 'https://api.mercadopago.com/preapproval' \
  -H 'Authorization: Bearer <TEST_SELLER_ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
    "reason": "AIskuAlerts Pro",
    "auto_recurring": {
      "frequency": 1,
      "frequency_type": "months",
      "transaction_amount": 9990,
      "currency_id": "CLP"
    },
    "back_url": "https://aiskualerts.com/billing/callback",
    "external_reference": "<TENANT_ID>",
    "payer_email": "test_user_<BUYER_USERNAME_NUMBERS>@testuser.com"
  }'
```

**Email format:** Test user emails follow the pattern `test_user_<numbers_from_username>@testuser.com`

Example: If buyer username is `TESTUSER1985316111069307028`, email is `test_user_1985316111069307028@testuser.com`

### Step 4: Complete Checkout as Test Buyer

1. Open the `init_point` URL from the preapproval response
2. Log in with the **test buyer** credentials
3. Use a test credit card (see below)
4. Complete the payment

### Test Cards (Chile/MLC)

| Card | Number | CVV | Expiry |
|------|--------|-----|--------|
| Mastercard Credit | 5416 7526 0258 2580 | 123 | 11/30 |
| Visa Credit | 4168 8188 4444 7115 | 123 | 11/30 |
| Mastercard Debit | 5241 0198 2664 6950 | 123 | 11/30 |
| Visa Debit | 4023 6535 2391 4373 | 123 | 11/30 |

**Cardholder name for test scenarios:**
- `APRO` - Payment approved
- `OTHE` - Rejected (general error)
- `FUND` - Rejected (insufficient funds)
- `SECU` - Rejected (invalid CVV)
- `EXPI` - Rejected (expiration date)

**Document:** Type "Otro", Number `123456789`

### Step 5: Verify Subscription Status

```bash
curl 'https://api.mercadopago.com/preapproval/<PREAPPROVAL_ID>' \
  -H 'Authorization: Bearer <TEST_SELLER_ACCESS_TOKEN>'
```

Expected response after successful payment:
```json
{
  "id": "<preapproval_id>",
  "status": "authorized",
  "external_reference": "<tenant_id>",
  "payer_id": 123456789,
  "collector_id": 987654321,
  "next_payment_date": "2026-02-13T..."
}
```

### Webhook Flow

After payment completion, MercadoPago sends a webhook:
```json
{
  "type": "subscription_preapproval",
  "data": { "id": "<preapproval_id>" }
}
```

Your webhook handler should:
1. Fetch the preapproval by ID
2. Verify `status` is `authorized`
3. Extract `external_reference` (tenant ID)
4. Call `tenantRepo.activateSubscription(tenantId, preapprovalId)`

### Testing Webhooks Locally

```bash
# Terminal 1: Run server
bun run dev

# Terminal 2: Expose with ngrok
ngrok http 3000

# Update webhook URL in test seller's MercadoPago dashboard
```

### Testing Cancellation

```bash
curl -X PUT 'https://api.mercadopago.com/preapproval/<PREAPPROVAL_ID>' \
  -H 'Authorization: Bearer <TEST_SELLER_ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"status": "cancelled"}'
```

## Webhook Configuration

### Setting Up Webhooks

1. Go to [MercadoPago Developers](https://www.mercadopago.cl/developers)
2. Navigate to: Your applications > aiskualerts > Webhooks
3. Configure:
   - **Production URL:** `https://aiskualerts.com/api/webhooks/mercadopago`
   - **Sandbox URL:** Your ngrok URL for testing
   - **Topics:** Select `subscription_preapproval`

### Webhook Security

The webhook endpoint validates signatures using HMAC-SHA256:

```
x-signature: ts=1234567890,v1=abc123...
x-request-id: request-uuid
```

**Important:** Set `MERCADOPAGO_WEBHOOK_SECRET` in production!

### Testing Webhooks Locally

Use ngrok to expose your local server:

```bash
# Terminal 1: Run server
bun run dev

# Terminal 2: Expose with ngrok
ngrok http 3000
```

Then update the sandbox webhook URL in MercadoPago dashboard.

## Production Checklist

### Before Going Live

- [ ] **Credentials:**
  - [ ] Switch from Test to Production access token
  - [ ] Store in 1Password: `MERCADOPAGO_ACCESS_TOKEN`
  - [ ] Store webhook secret in 1Password: `MERCADOPAGO_WEBHOOK_SECRET`

- [ ] **Webhook Configuration:**
  - [ ] Set production webhook URL: `https://aiskualerts.com/api/webhooks/mercadopago`
  - [ ] Verify topic: `subscription_preapproval`
  - [ ] Test webhook delivery

- [ ] **Database:**
  - [ ] Run schema migration for subscription columns
  - [ ] Verify `subscription_id`, `subscription_status`, `subscription_ends_at` columns exist

- [ ] **Environment:**
  - [ ] Set `APP_URL=https://aiskualerts.com`
  - [ ] Set correct `MERCADOPAGO_PLAN_AMOUNT` and `MERCADOPAGO_PLAN_CURRENCY`

- [ ] **Testing:**
  - [ ] Complete one real test transaction (can refund immediately)
  - [ ] Verify webhook activates subscription
  - [ ] Test cancellation flow

### Quality Evaluation

MercadoPago provides integration quality evaluation. After a test payment:

```bash
# Using MercadoPago MCP tool
# Run quality_evaluation with a payment ID
```

Or via API:
```bash
curl "https://api.mercadopago.com/v1/payments/PAYMENT_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Billing Flow Architecture

```
┌─────────────┐     ┌────────────────┐     ┌──────────────┐
│   User      │────▶│ POST /checkout │────▶│ MercadoPago  │
│   Browser   │     │                │     │ API          │
└─────────────┘     └────────────────┘     └──────────────┘
                            │                      │
                            │ redirect URL         │
                            ▼                      │
                    ┌────────────────┐             │
                    │ MercadoPago    │◀────────────┘
                    │ Checkout Page  │
                    └────────────────┘
                            │
                            │ user completes payment
                            ▼
                    ┌────────────────┐     ┌──────────────┐
                    │ POST /webhooks │────▶│ Validate     │
                    │ /mercadopago   │     │ Signature    │
                    └────────────────┘     └──────────────┘
                                                   │
                                                   ▼
                                           ┌──────────────┐
                                           │ Activate     │
                                           │ Subscription │
                                           └──────────────┘
```

## Troubleshooting

### Webhook Not Received

1. Check ngrok/server is running and accessible
2. Verify webhook URL in MercadoPago dashboard
3. Check server logs for incoming requests
4. Verify the topic is `subscription_preapproval`

### Signature Validation Failed

1. Ensure `MERCADOPAGO_WEBHOOK_SECRET` is set correctly
2. Check that headers `x-signature` and `x-request-id` are present
3. Verify secret matches dashboard configuration

### Checkout Returns Error

1. Check `MERCADOPAGO_ACCESS_TOKEN` is valid
2. Verify user is authenticated and has a tenant
3. Check tenant doesn't already have an active subscription

### Subscription Not Activating

1. Check webhook is being received (server logs)
2. Verify signature validation passes
3. Check `external_reference` contains valid tenant ID
4. Verify preapproval status is `authorized`

## References

- [MercadoPago Subscriptions Documentation](https://www.mercadopago.cl/developers/es/docs/subscriptions)
- [Webhook Integration Guide](https://www.mercadopago.cl/developers/es/docs/subscriptions/notifications)
- [Test Cards Reference](https://www.mercadopago.cl/developers/es/docs/checkout-api/additional-content/test-cards)
