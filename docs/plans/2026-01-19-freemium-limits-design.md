# Freemium Threshold Limits Design

## Overview

Implement a freemium model that limits free tenants to 50 active thresholds while allowing Pro subscribers unlimited thresholds.

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
| Limit scope | Per-tenant (organization shares the limit) |
| Enforcement | Soft block - can create beyond 50, but they won't trigger alerts |
| Active selection | First 50 by `created_at` |
| Pro limit | Unlimited |

## Data Model

No new tables required. Existing structure supports this:

- `tenants.subscription_status` tracks `'none'` | `'active'` | `'cancelled'`
- `thresholds.created_at` provides ordering for determining active thresholds

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

When generating alerts, only process the first 50 thresholds for free tenants:

```ts
async function getActiveThresholds(tenantId: string): Promise<Threshold[]> {
  const tenant = await tenantRepo.findById(tenantId);
  const isPro = isTenantPaid(tenant);

  const thresholds = await thresholdRepo.findByTenant(tenantId, {
    orderBy: 'created_at',
    limit: isPro ? undefined : PLANS.FREE.maxThresholds
  });

  return thresholds;
}
```

### Skipped Threshold Query

For email digests, fetch thresholds beyond the limit:

```ts
async function getSkippedThresholds(tenantId: string): Promise<Threshold[]> {
  const tenant = await tenantRepo.findById(tenantId);
  if (isTenantPaid(tenant)) return [];

  return thresholdRepo.findByTenant(tenantId, {
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
- **Approaching limit banner** (40-49 thresholds): "You're approaching your free limit"
- **Over limit banner** (50+ thresholds): "X thresholds are inactive. Upgrade to Pro for unlimited alerts"
- **Inactive thresholds**: Muted/disabled style with "Inactive - Upgrade to enable" badge

### 2. Threshold Creation Flow

When creating threshold #51+, show inline warning: "This threshold won't generate alerts until you upgrade"

Creation still proceeds - no blocking.

### 3. Settings/Billing Page

- Current plan display: "Free Plan" or "Pro Plan"
- Usage meter: "45/50 thresholds"
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

For free tenants over the limit, add a section at the bottom of digest emails:

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
async function buildDigest(tenantId: string) {
  const activeAlerts = await getTriggeredAlerts(tenantId);
  const skippedCount = await getSkippedThresholdCount(tenantId);

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
| `src/db/repositories/threshold.ts` | Add limit-aware queries |
| `src/notifications/digest-builder.ts` | Add skipped count logic |
| Frontend: threshold list | Usage count, inactive badges, banners |
| Frontend: threshold creation | Inline warning for 51+ |
| Frontend: settings page | Plan display, usage meter |

## Out of Scope

- Multiple Pro tiers with different limits
- User-selectable active thresholds
- Hard blocking of threshold creation
