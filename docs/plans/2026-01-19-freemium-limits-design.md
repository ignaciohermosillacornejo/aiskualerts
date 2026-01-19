# Freemium Threshold Limits Design

## Overview

Implement a freemium model that limits free users to 50 active thresholds (across all their tenants) while allowing Pro subscribers unlimited thresholds.

## Requirements

### Free Tier
- Connect to Bsale
- Sync database
- Create thresholds (unlimited creation, but only first 50 are active)
- Receive email alerts (for active thresholds only)

### Pro Tier
- All free features
- Unlimited active thresholds

## Design Decisions

| Aspect | Decision |
|--------|----------|
| Limit scope | Per-user (50 total across all tenants a user belongs to) |
| Enforcement | Soft block - can create beyond 50, but they won't trigger alerts |
| Active selection | First 50 by `created_at` across all tenants |
| Pro limit | Unlimited |

## Data Model

### Subscription Tracking

Subscriptions are tracked at the **user level**, not tenant level:

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'none';
ALTER TABLE users ADD COLUMN subscription_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN subscription_ends_at TIMESTAMPTZ;
```

This allows:
- A user with multiple tenants to have one Pro subscription covering all
- Future: different users within a tenant can have different plans

### New Constants

```ts
// src/billing/plans.ts
export const PLANS = {
  FREE: { maxThresholds: 50 },
  PRO: { maxThresholds: Infinity }
} as const;
```

## Enforcement Logic

### Active Threshold Query

When generating alerts, query thresholds across all tenants for the user, ordered by creation date:

```ts
async function getActiveThresholdsForUser(userId: string): Promise<Threshold[]> {
  const user = await userRepo.findById(userId);
  const isPro = isUserPaid(user);

  // Get all thresholds across all tenants this user belongs to
  const thresholds = await thresholdRepo.findByUser(userId, {
    orderBy: 'created_at',
    limit: isPro ? undefined : PLANS.FREE.maxThresholds
  });

  return thresholds;
}
```

SQL for cross-tenant threshold query:

```sql
SELECT t.* FROM thresholds t
JOIN user_tenants ut ON t.tenant_id = ut.tenant_id
WHERE ut.user_id = $1
ORDER BY t.created_at ASC
LIMIT $2;  -- 50 for free users, no limit for pro
```

### Skipped Threshold Query

For email digests, fetch thresholds beyond the limit:

```ts
async function getSkippedThresholdsForUser(userId: string): Promise<Threshold[]> {
  const user = await userRepo.findById(userId);
  if (isUserPaid(user)) return [];

  return thresholdRepo.findByUser(userId, {
    orderBy: 'created_at',
    offset: PLANS.FREE.maxThresholds
  });
}
```

### Threshold Creation

Creation remains unrestricted. Users can always create thresholds. The limit only affects which thresholds generate alerts.

## UI Changes

### 1. Threshold List Page

- **Header**: Shows "Using 45 of 50 thresholds" (free) or "Using 45 thresholds" (pro)
  - Count is across all tenants, not just current tenant
- **Approaching limit banner** (40-49 thresholds): "You're approaching your free limit"
- **Over limit banner** (50+ thresholds): "X thresholds are inactive. Upgrade to Pro for unlimited alerts"
- **Inactive thresholds**: Muted/disabled style with "Inactive - Upgrade to enable" badge

Note: When viewing a specific tenant's thresholds, some may be inactive because the user hit their global limit in another tenant.

### 2. Threshold Creation Flow

When creating threshold #51+, show inline warning: "This threshold won't generate alerts until you upgrade"

Creation still proceeds - no blocking.

### 3. Settings/Billing Page

- Current plan display: "Free Plan" or "Pro Plan"
- Usage meter: "45/50 thresholds (across all accounts)"
- Upgrade CTA with pricing
- For Pro: "Unlimited thresholds" with manage/cancel options

## Banner Dismissal Logic

The over-limit banner (50+ thresholds) is dismissible to avoid nagging:

- Banner includes an "X" dismiss button
- Dismissal stored in `localStorage` with timestamp
- Banner reappears after 7 days

```ts
function shouldShowLimitBanner(thresholdCount: number): boolean {
  if (thresholdCount < 50) return false;

  const dismissedAt = localStorage.get('limitBannerDismissedAt');
  if (!dismissedAt) return true;

  const daysSince = daysBetween(new Date(dismissedAt), new Date());
  return daysSince >= 7;
}
```

The "approaching limit" banner (40-49) does not need dismissal logic.

## Email Digest Changes

For free users over the limit, add a section at the bottom of digest emails:

```
--- Your Stock Alerts ---

⚠️ Product A - Low stock (5 units remaining)
⚠️ Product B - 3 days until stockout

--- Skipped Due to Free Plan Limit ---

You have 12 thresholds that aren't generating alerts.
Upgrade to Pro for unlimited threshold monitoring.

[Upgrade to Pro →]
```

Implementation:

```ts
async function buildDigest(userId: string) {
  const activeAlerts = await getTriggeredAlertsForUser(userId);
  const skippedCount = await getSkippedThresholdCountForUser(userId);

  return {
    alerts: activeAlerts,
    skippedThresholds: skippedCount, // 0 for pro users
    showUpgradeCTA: skippedCount > 0
  };
}
```

Only the count is shown, not a list of every skipped threshold.

## Files to Modify

| File | Changes |
|------|---------|
| `src/billing/plans.ts` | New file - plan constants |
| `src/db/migrations/` | New migration - add subscription columns to users table |
| `src/db/repositories/user.ts` | Add subscription status methods |
| `src/db/repositories/threshold.ts` | Add cross-tenant queries by user |
| `src/billing/subscription-service.ts` | Update to check user instead of tenant |
| `src/billing/mercadopago.ts` | Update to associate subscription with user |
| `src/api/handlers/billing.ts` | Update checkout/cancel to use user |
| `src/notifications/digest-builder.ts` | Add skipped count logic |
| Frontend: threshold list | Usage count, inactive badges, banners |
| Frontend: threshold creation | Inline warning for 51+ |
| Frontend: settings page | Plan display, usage meter |

## Migration Notes

### Moving Subscription from Tenant to User

If there are existing tenant subscriptions:
1. Create new user subscription columns
2. Migrate existing `tenants.subscription_*` data to the primary user of each tenant
3. Keep tenant columns temporarily for backwards compatibility
4. Remove tenant subscription columns in a later migration

## Future Considerations

- **Multi-tenant users**: A user may belong to multiple tenants. Their 50 threshold limit is shared across all.
- **User roles**: Future feature to add users with different roles (admin, viewer, etc.) to a tenant.
- **Team plans**: Potential future tier where a tenant pays for all users, not individual subscriptions.

## Out of Scope

- Multiple Pro tiers with different limits
- User-selectable active thresholds
- Hard blocking of threshold creation
- Team/organization billing (future consideration)
