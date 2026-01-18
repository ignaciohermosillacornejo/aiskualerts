# Authentication & Session Management

## Overview

The app uses cookie-based sessions with CSRF protection via the double-submit pattern.

## Session Lifecycle

- **Initial TTL:** 7 days
- **Sliding window:** Refreshes when < 3.5 days remaining
- **Storage:** PostgreSQL `sessions` table

When a user makes a request and their session is within the refresh threshold:
1. Auth middleware updates `expires_at` in DB
2. Response includes refreshed cookies with new Max-Age
3. Token values stay the same (only expiry extends)

## CSRF Protection

Uses HMAC-signed tokens with the double-submit cookie pattern:
- Cookie: `csrf_token` (readable by JS)
- Header: `X-CSRF-Token`
- TTL: 7 days (aligned with session)

**Excluded paths:** `/api/webhooks/`, `/api/auth/bsale/`, `/api/auth/magic-link`, `/api/sync/trigger`

## Key Files

| File | Purpose |
|------|---------|
| `src/api/middleware/auth.ts` | Authentication + sliding window logic |
| `src/api/middleware/csrf.ts` | CSRF validation middleware |
| `src/utils/csrf.ts` | Token generation/validation |
| `src/utils/cookies.ts` | Cookie helpers, TTL constants |
| `src/api/utils/router.ts` | `authedRoute()` HOF for auto-refresh |
| `src/api/utils/response.ts` | `withRefreshedCookies()` wrapper |
| `src/db/repositories/session.ts` | Session CRUD + `refreshSession()` |

## Using authedRoute()

Wrap handlers to get automatic session refresh:

```typescript
import { createAuthedRoute } from "@/api/utils/router";

const authedRoute = createAuthedRoute(authMiddleware);

const getProfile = authedRoute(async (req, { userId, tenantId }) => {
  // Handler has access to auth context
  // Response automatically gets refreshed cookies if needed
  return Response.json({ userId });
});
```

## Login Flows

1. **Magic Link:** `POST /api/auth/magic-link` → email → `GET /api/auth/magic-link/verify`
2. **Bsale OAuth:** `GET /api/auth/bsale/start` → Bsale → `GET /api/auth/bsale/callback`

Both create 7-day sessions and set both `session_token` and `csrf_token` cookies.
