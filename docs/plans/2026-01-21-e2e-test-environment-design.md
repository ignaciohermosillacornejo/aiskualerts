# E2E Test Environment Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable E2E tests to run locally with just Docker (Postgres), no real API credentials needed.

**Architecture:** Configuration-driven mocking via environment variables. Real database, mocked external APIs.

**Tech Stack:** Playwright, Bun, PostgreSQL (Docker)

---

## Problem

E2E tests currently require real credentials (Resend API key, etc.) to run. This creates friction for local development and requires 1Password setup.

## Solution

Use a test-specific `.env.test` file that:
- Points to local Postgres (Docker)
- Configures email client to log instead of send
- Provides test-safe values for other config

External APIs (Bsale, MercadoPago) are already mocked via Playwright route interception.

---

## Implementation

### 1. Email Client Changes

**File:** `src/email/resend-client.ts`

Add `RESEND_API_URL` environment variable support:
- Default: `https://api.resend.com`
- If URL starts with `log://`: skip HTTP call, log email details to console, return success

```typescript
const RESEND_API_URL = process.env.RESEND_API_URL ?? "https://api.resend.com";

async function sendEmail(params) {
  if (RESEND_API_URL.startsWith("log://")) {
    console.log("[Email]", { to: params.to, subject: params.subject });
    return { success: true, id: `test-${Date.now()}` };
  }
  // ... existing implementation
}
```

### 2. Test Environment File

**File:** `.env.test` (new, committed to repo)

```bash
# Test environment for E2E tests
DATABASE_URL=postgres://aiskualerts:aiskualerts@localhost:5432/aiskualerts

# Postgres container config
POSTGRES_USER=aiskualerts
POSTGRES_PASSWORD=aiskualerts
POSTGRES_DB=aiskualerts

# Mock email - logs to console instead of sending
RESEND_API_URL=log://

# Application config
NODE_ENV=test
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000

# Bsale - route-intercepted by Playwright
BSALE_API_BASE_URL=https://api.bsale.io
BSALE_APP_ID=test
BSALE_INTEGRATOR_TOKEN=test
BSALE_REDIRECT_URI=http://localhost:3000/api/bsale/callback
BSALE_OAUTH_BASE_URL=https://oauth.bsale.io

# Security - test-only keys
TOKEN_ENCRYPTION_KEY=test-encryption-key-for-e2e-tests!
CSRF_TOKEN_SECRET=test-csrf-secret-for-e2e-testing!!

# MercadoPago - route-intercepted by Playwright
MERCADOPAGO_ACCESS_TOKEN=TEST-disabled
MERCADOPAGO_WEBHOOK_SECRET=test_secret
MERCADOPAGO_PLAN_AMOUNT=9990
MERCADOPAGO_PLAN_CURRENCY=CLP

APP_URL=http://localhost:3000

# Disabled features
SYNC_ENABLED=false
DIGEST_ENABLED=false
```

### 3. Playwright Config Update

**File:** `playwright.config.ts`

Change webServer command to use test env file:

```typescript
webServer: {
  command: "bun --env-file=.env.test run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env["CI"],
  timeout: 120000,
  stdout: "pipe",
  stderr: "pipe",
},
```

---

## Test Execution

**Prerequisites:**
```bash
docker compose up -d postgres
```

**Run tests:**
```bash
# Headed (watch browser)
bunx playwright test --headed --project=chromium

# Headless
bunx playwright test
```

**Flow:**
1. Playwright starts server with `.env.test`
2. Server connects to local Postgres
3. Email calls log to console and return success
4. Bsale/MercadoPago calls are route-intercepted by Playwright fixtures
5. Auth fixture verifies magic links via test endpoint

---

## Future: CI Support

CI will need:
- Postgres service container
- Same `.env.test` file (already committed)
- No additional secrets required

(To be addressed in separate task)
