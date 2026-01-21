# Multi-Tenant Users Design

## Overview

Allow users to connect to multiple tenants (Bsale accounts/locations). A user managing multiple store branches can switch between them without logging out.

## Use Case

**Multi-location business**: One person manages multiple Bsale accounts (e.g., different store branches) under separate tenants.

## Key Decisions

| Decision | Choice |
|----------|--------|
| UX model | Tenant switcher in header (like Slack workspaces) |
| Connect flow | Self-service "Add Account" in settings via OAuth |
| Settings scope | Per-tenant (thresholds, notifications configured separately) |
| Login landing | Last used tenant |
| Bsale conflict | Error if client_code already owned by another user |
| Subscription model | Per-user (owner's plan determines tenant limits) |
| Threshold ownership | Team-shared per tenant (not per-user) |
| RBAC roles | Owner, Admin, Member (no Viewer) |

---

## Database Schema

Fresh design (replaces existing schema):

```sql
-- Tenants (Bsale accounts / locations)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255),
  bsale_client_code VARCHAR(100) UNIQUE,
  bsale_client_name VARCHAR(255),
  bsale_access_token TEXT,
  bsale_refresh_token TEXT,
  bsale_token_expires_at TIMESTAMPTZ,
  sync_status VARCHAR(50) NOT NULL DEFAULT 'not_connected',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (people)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  last_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  -- Subscription (owned by this user)
  subscription_id VARCHAR(255) UNIQUE,
  subscription_status VARCHAR(50) NOT NULL DEFAULT 'none',
  subscription_ends_at TIMESTAMPTZ,
  subscription_plan VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-Tenant memberships (many-to-many with RBAC)
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_email VARCHAR(255),
  digest_frequency VARCHAR(50) NOT NULL DEFAULT 'daily',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Magic link tokens
CREATE TABLE magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stock snapshots (daily sync from Bsale)
CREATE TABLE stock_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bsale_variant_id BIGINT NOT NULL,
  bsale_product_id BIGINT NOT NULL,
  product_name VARCHAR(500),
  variant_description VARCHAR(500),
  sku VARCHAR(255),
  quantity DECIMAL(15,4) NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, bsale_variant_id, snapshot_date)
);

-- Thresholds (shared per tenant, not per user)
CREATE TABLE thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bsale_variant_id BIGINT NOT NULL,
  min_quantity DECIMAL(15,4) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, bsale_variant_id)
);

-- Alerts (shared per tenant)
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threshold_id UUID NOT NULL REFERENCES thresholds(id) ON DELETE CASCADE,
  bsale_variant_id BIGINT NOT NULL,
  triggered_quantity DECIMAL(15,4) NOT NULL,
  threshold_quantity DECIMAL(15,4) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  dismissed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tenants_owner ON tenants(owner_id);
CREATE INDEX idx_stock_snapshots_tenant_date ON stock_snapshots(tenant_id, snapshot_date);
CREATE INDEX idx_stock_snapshots_variant ON stock_snapshots(tenant_id, bsale_variant_id);
CREATE INDEX idx_thresholds_tenant ON thresholds(tenant_id);
CREATE INDEX idx_alerts_tenant_status ON alerts(tenant_id, status);
CREATE INDEX idx_alerts_status_pending ON alerts(status) WHERE status = 'pending';
CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_magic_link_tokens_token ON magic_link_tokens(token);
CREATE INDEX idx_magic_link_tokens_email ON magic_link_tokens(email);
```

---

## RBAC Permissions

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View products/stock | ✓ | ✓ | ✓ |
| View alerts/thresholds | ✓ | ✓ | ✓ |
| Create/edit/delete thresholds | ✓ | ✓ | ✓ |
| Dismiss alerts | ✓ | ✓ | ✓ |
| Trigger manual sync | ✓ | ✓ | ✓ |
| Manage tenant settings | ✓ | ✓ | ✗ |
| Invite/remove members | ✓ | ✓ | ✗ |
| Change member roles | ✓ | ✗ | ✗ |
| Disconnect Bsale account | ✓ | ✗ | ✗ |
| Delete tenant | ✓ | ✗ | ✗ |

**Notes:**
- `owner` assigned when user creates tenant via OAuth
- Only one owner per tenant (the `tenants.owner_id` user)
- Owner cannot be removed or demoted

---

## Subscription & Limits

**Model:** Subscription per user, limits per tenant based on owner's plan.

| Plan | Thresholds per tenant |
|------|----------------------|
| FREE | 50 |
| PRO | Unlimited |

**Logic:**
```
tenant.owner_id → users.subscription_status
  - active → PRO limits
  - none/cancelled (past grace) → FREE limits
```

**Team members** use the owner's plan — they don't need their own subscription.

---

## Auth Flows

### Magic Link Login

1. User requests magic link with email
2. On verify: find or create user by email
3. If user has tenants → set `current_tenant_id` to `last_tenant_id` (or first)
4. If no tenants → `current_tenant_id = null`, redirect to onboarding
5. Set session cookie, redirect to `/app`

### Bsale OAuth (New User)

1. User starts OAuth without session
2. On callback: find or create user by email
3. Verify `bsale_client_code` not owned by another user (error if conflict)
4. Create tenant with `owner_id = user.id`
5. Create `user_tenants` with `role = 'owner'`
6. Create session with `current_tenant_id = new tenant`
7. Redirect to `/app`

### Add Tenant (Authenticated)

1. User clicks "Add Account" in settings
2. Starts OAuth with existing session
3. On callback: verify `bsale_client_code` not owned by another user
4. Create tenant with `owner_id = current user`
5. Create `user_tenants` with `role = 'owner'`
6. Update session's `current_tenant_id` to new tenant
7. Redirect to `/app`

### Switch Tenant

1. User clicks tenant in switcher dropdown
2. `POST /api/tenants/switch` with `{ tenantId }`
3. Verify user has membership in `user_tenants`
4. Update `sessions.current_tenant_id`
5. Update `users.last_tenant_id`
6. Return success, frontend reloads data

---

## API Endpoints

### New

```
GET  /api/tenants              List user's tenants (for switcher)
POST /api/tenants/switch       Switch current tenant { tenantId }
GET  /api/auth/bsale/connect   Start OAuth to add tenant (authenticated)
```

### Modified

```
GET  /api/auth/me              Returns: user, currentTenant, tenants[], role
GET  /api/auth/bsale/callback  Handles both new user + add tenant flows
```

### Response: GET /api/auth/me

```typescript
{
  user: {
    id: string;
    email: string;
    name: string;
    subscriptionStatus: string;
    subscriptionPlan: string;
  };
  currentTenant: {
    id: string;
    name: string;
    bsaleClientCode: string;
    syncStatus: string;
  } | null;
  tenants: Array<{
    id: string;
    name: string;
    bsaleClientCode: string;
    role: string;
  }>;
  role: string | null;
}
```

### Auth Middleware

```typescript
interface AuthContext {
  userId: string;
  currentTenantId: string | null;
  role: string | null;
}
```

- Extract `current_tenant_id` from session
- If null and endpoint requires tenant → return 400
- Fetch role from `user_tenants`
- Attach context to request

---

## Frontend Components

### Header - Tenant Switcher

- Dropdown showing current tenant name
- Lists all tenants from AuthContext
- Click → `POST /api/tenants/switch` → reload data
- Role badge next to each tenant
- "Add Account" button → `/settings/accounts`

### AuthContext

```typescript
interface AuthState {
  user: User | null;
  currentTenant: Tenant | null;
  tenants: TenantMembership[];
  role: string | null;
  loading: boolean;
}

// Methods
switchTenant(tenantId: string): Promise<void>
refreshAuth(): Promise<void>
```

### Settings - Accounts Tab

- List connected Bsale accounts (tenants user owns)
- Shows: name, client code, sync status
- "Connect Bsale Account" button → OAuth

### Onboarding

- New users with no tenants land here
- Single CTA: "Connect your Bsale account"
- After OAuth → redirect to `/app`

### Protected Routes

- Check `currentTenant !== null` for tenant-required pages
- If null → redirect to `/onboarding`
- Settings accessible without tenant

---

## Integration with Freemium Branch

The `freemium-limits` branch will be merged first. After merge, reconcile:

| Change | Action |
|--------|--------|
| Drop `users.tenant_id` | Remove column, queries use `user_tenants` |
| Add `tenants.owner_id` | New column |
| Add `user_tenants` table | New table |
| Drop `thresholds.user_id` | Remove, add `created_by` for audit |
| Drop `alerts.user_id` | Remove, add `dismissed_by` for audit |
| Threshold limit logic | Change from per-user-cross-tenant to per-tenant-by-owner |

**Limit enforcement change:**

```typescript
// OLD (freemium branch)
const count = await thresholdRepo.countByUserAcrossTenants(userId);
const plan = getPlanForUser(user);

// NEW (multi-tenant)
const count = await thresholdRepo.countByTenant(tenantId);
const owner = await userRepo.findById(tenant.ownerId);
const plan = getPlanForUser(owner);
```

---

## Future Work (Not in Scope)

- Team invite flow (email invite, accept/decline)
- Team management UI
- Role change UI
- Audit logging
