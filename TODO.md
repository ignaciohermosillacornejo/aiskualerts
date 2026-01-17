# AISku Alerts - TODO / Known Issues

This document tracks known issues and improvements needed for the application.

---

## Critical Issues

### 1. `/api/auth/me` Returns Hardcoded Email Instead of Real User

**Status:** Open
**Priority:** Critical
**File:** `src/api/routes/auth.ts` (lines 77-92)

**Problem:** The `/api/auth/me` endpoint returns a hardcoded `demo@empresa.cl` email instead of the actual logged-in user's email. This is leftover mock code that was never updated to use the session-based user lookup.

**Current code:**
```typescript
"/api/auth/me": {
  GET: (req) => {
    const cookie = req.headers.get("Cookie") ?? "";
    if (!cookie.includes("session_token=")) {
      return jsonWithCors({ user: null }, { status: 401 });
    }
    return jsonWithCors({
      user: {
        id: "u1",
        email: "demo@empresa.cl",  // HARDCODED!
        name: "Usuario Demo",
        role: "admin" as const,
      },
    });
  },
},
```

**Fix required:**
1. Extract session token from cookie
2. Look up session in `sessions` table via `SessionRepository`
3. Get user from `users` table via `UserRepository`
4. Return actual user data (email, name, etc.)

**Related files:**
- `src/db/repositories/session.ts` - Session lookup
- `src/db/repositories/user.ts` - User lookup
- `src/api/middleware/auth.ts` - Already has `extractSessionToken()` and session validation logic

---

### 2. Products Page Shows "Something went wrong"

**Status:** Open
**Priority:** Critical
**File:** `src/api/routes/products.ts` and `src/frontend/pages/Products.tsx`

**Problem:** API response structure mismatch between backend and frontend.

**Backend returns:**
```typescript
{ data: products, pagination: {...} }
```

**Frontend expects:**
```typescript
{ products: Product[], total: number }
```

**Fix required:**
- Option A: Change API to return `{ products, total }` format
- Option B: Update frontend to expect `{ data, pagination }` format
- Ensure consistency with `GetProductsResponse` interface in `src/frontend/api/client.ts`

---

### 3. Thresholds Page Crashes

**Status:** Open
**Priority:** Critical
**Files:**
- `src/api/routes/thresholds.ts`
- `src/frontend/pages/Thresholds.tsx`

**Problem:** Same API response structure mismatch as Products page.

**Backend returns:**
```typescript
{ data: thresholds, pagination: {...} }
```

**Frontend expects:**
```typescript
{ thresholds: Threshold[], total: number }
```

**Additional issues:**
- Missing error state updates in save/delete operations
- Race condition in product lookup for threshold display
- No validation before optimistic UI updates

---

## UX Improvements

### 4. Bsale Connection Should Not Ask for Domain

**Status:** Open
**Priority:** High
**File:** `src/frontend/pages/Settings.tsx` (lines 254-290)

**Current behavior:** User must enter their "Codigo de Cliente Bsale" (e.g., "miempresa" if their URL is miempresa.bsale.cl).

**Requested behavior:** Just redirect directly to Bsale login. Bsale should handle identifying the company.

**Investigation needed:**
- Check if Bsale OAuth flow actually requires `client_code` parameter
- If required by Bsale API, consider:
  - Asking user for full URL and extracting subdomain
  - Using a different Bsale OAuth flow if available
  - Better UX explanation of what "client_code" means

**Current OAuth URL format:**
```
https://oauth.bsale.io/login?app_id=...&client_code=miempresa&...
```

---

### 5. Subscription Should Confirm Before Redirecting to MercadoPago

**Status:** Open
**Priority:** Medium
**File:** `src/frontend/pages/Settings.tsx` (lines 158-174)

**Current behavior:** Clicking "Actualizar a Pro" immediately redirects to MercadoPago with no confirmation.

**Requested behavior:** Show a confirmation popup with:
- Price information
- What they're subscribing to
- Cancel/Confirm buttons

**Implementation:**
- Use existing `ConfirmModal` component (already used for threshold deletion)
- Show plan details and price before redirect

---

### 6. View Past/Dismissed Alerts (Alert History)

**Status:** Open
**Priority:** Medium
**Files:**
- `src/frontend/pages/Alerts.tsx`
- `src/api/routes/alerts.ts`
- `src/db/repositories/alert.ts`

**Current behavior:** Dismissed alerts are removed from the UI and cannot be viewed again.

**Requested behavior:** Ability to view alert history including dismissed alerts.

**Backend already supports this:**
- `AlertRepository.findByUserWithFilter()` accepts status filter
- Database stores all alerts permanently with `status` column

**Implementation needed:**
1. Add "Ver historial" / "Alertas descartadas" tab or toggle in Alerts page
2. Update API call to include `status` filter
3. Display historical alerts (possibly with different styling for dismissed)

---

### 7. Hide Sync Button Until Bsale is Connected

**Status:** Open
**Priority:** Medium
**Files:**
- `src/frontend/pages/Dashboard.tsx`
- `src/frontend/pages/Products.tsx`

**Current behavior:** "Sincronizar Ahora" button and Products page are visible even when Bsale is not connected.

**Requested behavior:**
- Hide "Sincronizar ahora" button when `tenant.sync_status === 'not_connected'`
- Products page should show a message to connect Bsale first
- All product data should come from Bsale sync, not mock data

**Implementation:**
1. Check tenant sync_status in Dashboard/Products components
2. Show "Connect to Bsale" CTA instead of sync button when not connected
3. Disable or hide Products page content until connected

---

### 8. Remove Non-functional Bell Icon

**Status:** Open
**Priority:** Low
**File:** `src/frontend/components/Header.tsx` (lines 53-57)

**Current behavior:** Bell icon is visible in header but does nothing when clicked.

**Requested behavior:** Remove the bell icon until notification functionality is implemented.

**Fix:** Simply remove the bell button JSX from Header component.

---

## Database Migration Issues

### 9. Migrations Not Applied Automatically

**Status:** Needs Investigation
**Priority:** High
**File:** `.github/workflows/deploy.yml`

**Problem:** Migration 005 was not applied during deploy even though `bun src/db/migrate.ts` was run.

**Current deploy flow:**
1. Seeds `schema_migrations` with versions 1-4
2. Runs `bun src/db/migrate.ts`
3. Expected: Migration 5 gets applied
4. Actual: Migration 5 was not applied

**Investigation needed:**
- Check if migration files are correctly copied to server
- Add logging/verification step after migrations
- Consider adding post-migration verification

---

## Technical Debt

### 10. Mock Auth Routes Should Use Real User Data

**Status:** Open
**Priority:** High
**File:** `src/api/routes/auth.ts`

The entire auth routes file uses mock implementations that don't integrate with the real session/user system. The magic link auth flow properly creates sessions and users, but the `/api/auth/me` endpoint ignores this.

**Files to align:**
- `src/api/routes/auth.ts` - Uses mock data
- `src/api/routes/magic-link.ts` - Uses real sessions
- `src/api/middleware/auth.ts` - Has proper session validation

---

## File Reference

| Issue | Primary File(s) |
|-------|----------------|
| #1 Wrong email | `src/api/routes/auth.ts` |
| #2 Products error | `src/api/routes/products.ts`, `src/frontend/pages/Products.tsx` |
| #3 Thresholds crash | `src/api/routes/thresholds.ts`, `src/frontend/pages/Thresholds.tsx` |
| #4 Bsale domain | `src/frontend/pages/Settings.tsx` |
| #5 Subscription confirm | `src/frontend/pages/Settings.tsx` |
| #6 Alert history | `src/frontend/pages/Alerts.tsx` |
| #7 Hide sync | `src/frontend/pages/Dashboard.tsx`, `src/frontend/pages/Products.tsx` |
| #8 Bell icon | `src/frontend/components/Header.tsx` |
| #9 Migrations | `.github/workflows/deploy.yml` |
| #10 Mock auth | `src/api/routes/auth.ts` |
