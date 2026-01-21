# Multi-Tenant Users Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to connect to multiple Bsale accounts (tenants) with a tenant switcher UX.

**Architecture:** Many-to-many user-tenant relationship via junction table. Sessions track current tenant. Owner's subscription determines tenant limits. Thresholds/alerts are team-shared per tenant.

**Tech Stack:** PostgreSQL, Bun, React, TypeScript, Zod

**Prerequisites:**
- The `freemium-limits` branch must be merged first
- This implementation reconciles both designs into the final schema

---

## Phase 1: Database Schema

### Task 1.1: Create Fresh Schema Migration

**Files:**
- Create: `src/db/migrations/010_multi_tenant_users.sql`

**Step 1: Write the migration file**

```sql
-- Migration: Multi-tenant users
-- Allows users to belong to multiple tenants

-- 1. Create user_tenants junction table
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_email VARCHAR(255),
  digest_frequency VARCHAR(50) NOT NULL DEFAULT 'daily',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);

-- 2. Add owner_id to tenants (will be populated from existing data)
ALTER TABLE tenants ADD COLUMN owner_id UUID;

-- 3. Add last_tenant_id to users
ALTER TABLE users ADD COLUMN last_tenant_id UUID;

-- 4. Add current_tenant_id to sessions
ALTER TABLE sessions ADD COLUMN current_tenant_id UUID;

-- 5. Migrate existing data: Create user_tenants entries from users.tenant_id
INSERT INTO user_tenants (user_id, tenant_id, role, notification_enabled, notification_email, digest_frequency)
SELECT
  id as user_id,
  tenant_id,
  'owner' as role,
  notification_enabled,
  notification_email,
  digest_frequency
FROM users
WHERE tenant_id IS NOT NULL;

-- 6. Set owner_id on tenants from first user (by created_at)
UPDATE tenants t
SET owner_id = (
  SELECT u.id
  FROM users u
  WHERE u.tenant_id = t.id
  ORDER BY u.created_at ASC
  LIMIT 1
)
WHERE owner_id IS NULL;

-- 7. Set last_tenant_id on users from their current tenant_id
UPDATE users SET last_tenant_id = tenant_id WHERE tenant_id IS NOT NULL;

-- 8. Set current_tenant_id on sessions from user's tenant_id
UPDATE sessions s
SET current_tenant_id = u.tenant_id
FROM users u
WHERE s.user_id = u.id AND u.tenant_id IS NOT NULL;

-- 9. Modify thresholds: remove user_id, add created_by
ALTER TABLE thresholds ADD COLUMN created_by UUID;
UPDATE thresholds SET created_by = user_id;
-- Drop unique constraint that includes user_id
ALTER TABLE thresholds DROP CONSTRAINT IF EXISTS thresholds_tenant_id_user_id_bsale_variant_id_key;
-- Add new unique constraint without user_id
ALTER TABLE thresholds ADD CONSTRAINT thresholds_tenant_variant_unique UNIQUE(tenant_id, bsale_variant_id);
-- Remove user_id column
ALTER TABLE thresholds DROP COLUMN user_id;

-- 10. Modify alerts: remove user_id, add dismissed_by
ALTER TABLE alerts ADD COLUMN dismissed_by UUID;
UPDATE alerts SET dismissed_by = user_id WHERE status = 'dismissed';
ALTER TABLE alerts DROP COLUMN user_id;

-- 11. Drop tenant_id from users (relationship now in user_tenants)
ALTER TABLE users DROP COLUMN tenant_id;

-- 12. Drop notification columns from users (now in user_tenants)
ALTER TABLE users DROP COLUMN IF EXISTS notification_enabled;
ALTER TABLE users DROP COLUMN IF EXISTS notification_email;
ALTER TABLE users DROP COLUMN IF EXISTS digest_frequency;

-- 13. Add foreign key constraints (after data migration)
ALTER TABLE user_tenants ADD CONSTRAINT fk_user_tenants_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_tenants ADD CONSTRAINT fk_user_tenants_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE tenants ADD CONSTRAINT fk_tenants_owner
  FOREIGN KEY (owner_id) REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT fk_users_last_tenant
  FOREIGN KEY (last_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_current_tenant
  FOREIGN KEY (current_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE thresholds ADD CONSTRAINT fk_thresholds_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE alerts ADD CONSTRAINT fk_alerts_dismissed_by
  FOREIGN KEY (dismissed_by) REFERENCES users(id) ON DELETE SET NULL;

-- 14. Make owner_id NOT NULL now that data is migrated
ALTER TABLE tenants ALTER COLUMN owner_id SET NOT NULL;
```

**Step 2: Run migration**

```bash
bun run src/db/migrate.ts
```

Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add src/db/migrations/010_multi_tenant_users.sql
git commit -m "feat(db): add multi-tenant users schema migration"
```

---

## Phase 2: Type Definitions

### Task 2.1: Update Core Types

**Files:**
- Modify: `src/types/types.ts`

**Step 1: Add new types and update existing ones**

Add these types:

```typescript
export type UserTenantRole = "owner" | "admin" | "member";

export interface UserTenant {
  id: string;
  user_id: string;
  tenant_id: string;
  role: UserTenantRole;
  notification_enabled: boolean;
  notification_email: string | null;
  digest_frequency: DigestFrequency;
  created_at: Date;
}

export interface UserTenantWithTenant extends UserTenant {
  tenant_name: string | null;
  bsale_client_code: string | null;
  sync_status: SyncStatus;
}
```

Update `User` interface - remove `tenant_id`, add `last_tenant_id`:

```typescript
export interface User {
  id: string;
  email: string;
  name: string | null;
  last_tenant_id: string | null;
  subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: Date | null;
  created_at: Date;
}
```

Update `Tenant` interface - add `owner_id`:

```typescript
export interface Tenant {
  id: string;
  owner_id: string;
  name: string | null;
  bsale_client_code: string | null;
  bsale_client_name: string | null;
  bsale_access_token: string | null;
  bsale_refresh_token: string | null;
  bsale_token_expires_at: Date | null;
  sync_status: SyncStatus;
  last_sync_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
```

Update `Session` interface - add `current_tenant_id`:

```typescript
export interface Session {
  id: string;
  user_id: string;
  current_tenant_id: string | null;
  token: string;
  expires_at: Date;
  created_at: Date;
}
```

Update `Threshold` interface - remove `user_id`, add `created_by`:

```typescript
export interface Threshold {
  id: string;
  tenant_id: string;
  bsale_variant_id: number;
  min_quantity: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}
```

Update `Alert` interface - remove `user_id`, add `dismissed_by`:

```typescript
export interface Alert {
  id: string;
  tenant_id: string;
  threshold_id: string;
  bsale_variant_id: number;
  triggered_quantity: number;
  threshold_quantity: number;
  status: AlertStatus;
  dismissed_by: string | null;
  sent_at: Date | null;
  created_at: Date;
}
```

**Step 2: Run type check**

```bash
bun run typecheck
```

Expected: Many errors (expected - repositories not updated yet)

**Step 3: Commit**

```bash
git add src/types/types.ts
git commit -m "feat(types): update types for multi-tenant users"
```

---

## Phase 3: User Tenants Repository

### Task 3.1: Write UserTenantsRepository Tests

**Files:**
- Create: `tests/unit/db/repositories/user-tenants.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { UserTenantsRepository } from "../../../../src/db/repositories/user-tenants";
import type { DatabaseClient } from "../../../../src/db/client";
import type { UserTenant, UserTenantRole } from "../../../../src/types/types";

interface MockDb {
  query: ReturnType<typeof mock>;
  queryOne: ReturnType<typeof mock>;
  execute: ReturnType<typeof mock>;
}

function createMockDb(): { db: DatabaseClient; mocks: MockDb } {
  const mocks: MockDb = {
    query: mock(() => Promise.resolve([])),
    queryOne: mock(() => Promise.resolve(null)),
    execute: mock(() => Promise.resolve()),
  };
  return { db: mocks as unknown as DatabaseClient, mocks };
}

const mockUserTenant: UserTenant = {
  id: "ut-123",
  user_id: "user-123",
  tenant_id: "tenant-456",
  role: "owner",
  notification_enabled: true,
  notification_email: null,
  digest_frequency: "daily",
  created_at: new Date("2024-01-01"),
};

describe("UserTenantsRepository", () => {
  let repo: UserTenantsRepository;
  let mocks: MockDb;

  beforeEach(() => {
    const { db, mocks: m } = createMockDb();
    mocks = m;
    repo = new UserTenantsRepository(db);
  });

  describe("create", () => {
    test("creates user-tenant membership", async () => {
      mocks.query.mockResolvedValueOnce([mockUserTenant]);

      const result = await repo.create({
        user_id: "user-123",
        tenant_id: "tenant-456",
        role: "owner",
      });

      expect(result).toEqual(mockUserTenant);
      expect(mocks.query.mock.calls[0][0]).toContain("INSERT INTO user_tenants");
    });

    test("throws if creation fails", async () => {
      mocks.query.mockResolvedValueOnce([]);

      await expect(
        repo.create({ user_id: "user-123", tenant_id: "tenant-456", role: "owner" })
      ).rejects.toThrow("Failed to create user-tenant membership");
    });
  });

  describe("findByUserAndTenant", () => {
    test("returns membership if exists", async () => {
      mocks.queryOne.mockResolvedValueOnce(mockUserTenant);

      const result = await repo.findByUserAndTenant("user-123", "tenant-456");

      expect(result).toEqual(mockUserTenant);
      expect(mocks.queryOne.mock.calls[0][1]).toEqual(["user-123", "tenant-456"]);
    });

    test("returns null if not found", async () => {
      mocks.queryOne.mockResolvedValueOnce(null);

      const result = await repo.findByUserAndTenant("user-123", "tenant-456");

      expect(result).toBeNull();
    });
  });

  describe("getTenantsForUser", () => {
    test("returns all tenants for user with tenant details", async () => {
      const tenantsWithDetails = [
        { ...mockUserTenant, tenant_name: "Store A", bsale_client_code: "12345", sync_status: "success" },
      ];
      mocks.query.mockResolvedValueOnce(tenantsWithDetails);

      const result = await repo.getTenantsForUser("user-123");

      expect(result).toEqual(tenantsWithDetails);
      expect(mocks.query.mock.calls[0][0]).toContain("JOIN tenants");
    });
  });

  describe("getUsersForTenant", () => {
    test("returns all users for tenant", async () => {
      mocks.query.mockResolvedValueOnce([mockUserTenant]);

      const result = await repo.getUsersForTenant("tenant-456");

      expect(result).toHaveLength(1);
      expect(mocks.query.mock.calls[0][1]).toEqual(["tenant-456"]);
    });
  });

  describe("updateRole", () => {
    test("updates role for membership", async () => {
      mocks.queryOne.mockResolvedValueOnce({ ...mockUserTenant, role: "admin" });

      const result = await repo.updateRole("user-123", "tenant-456", "admin");

      expect(result?.role).toBe("admin");
      expect(mocks.queryOne.mock.calls[0][0]).toContain("UPDATE user_tenants");
    });
  });

  describe("updateNotificationSettings", () => {
    test("updates notification settings", async () => {
      const updated = { ...mockUserTenant, notification_enabled: false, digest_frequency: "weekly" };
      mocks.queryOne.mockResolvedValueOnce(updated);

      const result = await repo.updateNotificationSettings("user-123", "tenant-456", {
        notification_enabled: false,
        digest_frequency: "weekly",
      });

      expect(result?.notification_enabled).toBe(false);
      expect(result?.digest_frequency).toBe("weekly");
    });
  });

  describe("delete", () => {
    test("deletes membership", async () => {
      await repo.delete("user-123", "tenant-456");

      expect(mocks.execute.mock.calls[0][0]).toContain("DELETE FROM user_tenants");
      expect(mocks.execute.mock.calls[0][1]).toEqual(["user-123", "tenant-456"]);
    });
  });

  describe("hasAccess", () => {
    test("returns true if membership exists", async () => {
      mocks.queryOne.mockResolvedValueOnce(mockUserTenant);

      const result = await repo.hasAccess("user-123", "tenant-456");

      expect(result).toBe(true);
    });

    test("returns false if no membership", async () => {
      mocks.queryOne.mockResolvedValueOnce(null);

      const result = await repo.hasAccess("user-123", "tenant-456");

      expect(result).toBe(false);
    });
  });

  describe("getRole", () => {
    test("returns role for membership", async () => {
      mocks.queryOne.mockResolvedValueOnce({ role: "admin" });

      const result = await repo.getRole("user-123", "tenant-456");

      expect(result).toBe("admin");
    });

    test("returns null if no membership", async () => {
      mocks.queryOne.mockResolvedValueOnce(null);

      const result = await repo.getRole("user-123", "tenant-456");

      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/unit/db/repositories/user-tenants.test.ts
```

Expected: FAIL with "Cannot find module"

**Step 3: Commit test**

```bash
git add tests/unit/db/repositories/user-tenants.test.ts
git commit -m "test(user-tenants): add repository tests"
```

---

### Task 3.2: Implement UserTenantsRepository

**Files:**
- Create: `src/db/repositories/user-tenants.ts`

**Step 1: Write the implementation**

```typescript
import type { DatabaseClient } from "../client";
import type {
  UserTenant,
  UserTenantRole,
  UserTenantWithTenant,
  DigestFrequency,
} from "../../types/types";

export interface CreateUserTenantInput {
  user_id: string;
  tenant_id: string;
  role?: UserTenantRole;
  notification_enabled?: boolean;
  notification_email?: string;
  digest_frequency?: DigestFrequency;
}

export interface UpdateNotificationSettingsInput {
  notification_enabled?: boolean;
  notification_email?: string | null;
  digest_frequency?: DigestFrequency;
}

export class UserTenantsRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreateUserTenantInput): Promise<UserTenant> {
    const results = await this.db.query<UserTenant>(
      `INSERT INTO user_tenants (user_id, tenant_id, role, notification_enabled, notification_email, digest_frequency)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.user_id,
        input.tenant_id,
        input.role ?? "member",
        input.notification_enabled ?? true,
        input.notification_email ?? null,
        input.digest_frequency ?? "daily",
      ]
    );
    const membership = results[0];
    if (!membership) {
      throw new Error("Failed to create user-tenant membership");
    }
    return membership;
  }

  async findByUserAndTenant(
    userId: string,
    tenantId: string
  ): Promise<UserTenant | null> {
    return this.db.queryOne<UserTenant>(
      `SELECT * FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }

  async getTenantsForUser(userId: string): Promise<UserTenantWithTenant[]> {
    return this.db.query<UserTenantWithTenant>(
      `SELECT ut.*, t.name as tenant_name, t.bsale_client_code, t.sync_status
       FROM user_tenants ut
       JOIN tenants t ON ut.tenant_id = t.id
       WHERE ut.user_id = $1
       ORDER BY ut.created_at ASC`,
      [userId]
    );
  }

  async getUsersForTenant(tenantId: string): Promise<UserTenant[]> {
    return this.db.query<UserTenant>(
      `SELECT * FROM user_tenants WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId]
    );
  }

  async updateRole(
    userId: string,
    tenantId: string,
    role: UserTenantRole
  ): Promise<UserTenant | null> {
    return this.db.queryOne<UserTenant>(
      `UPDATE user_tenants SET role = $3 WHERE user_id = $1 AND tenant_id = $2 RETURNING *`,
      [userId, tenantId, role]
    );
  }

  async updateNotificationSettings(
    userId: string,
    tenantId: string,
    settings: UpdateNotificationSettingsInput
  ): Promise<UserTenant | null> {
    const updates: string[] = [];
    const values: unknown[] = [userId, tenantId];
    let paramIndex = 3;

    if (settings.notification_enabled !== undefined) {
      updates.push(`notification_enabled = $${paramIndex++}`);
      values.push(settings.notification_enabled);
    }
    if (settings.notification_email !== undefined) {
      updates.push(`notification_email = $${paramIndex++}`);
      values.push(settings.notification_email);
    }
    if (settings.digest_frequency !== undefined) {
      updates.push(`digest_frequency = $${paramIndex++}`);
      values.push(settings.digest_frequency);
    }

    if (updates.length === 0) {
      return this.findByUserAndTenant(userId, tenantId);
    }

    return this.db.queryOne<UserTenant>(
      `UPDATE user_tenants SET ${updates.join(", ")} WHERE user_id = $1 AND tenant_id = $2 RETURNING *`,
      values
    );
  }

  async delete(userId: string, tenantId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }

  async hasAccess(userId: string, tenantId: string): Promise<boolean> {
    const result = await this.findByUserAndTenant(userId, tenantId);
    return result !== null;
  }

  async getRole(userId: string, tenantId: string): Promise<UserTenantRole | null> {
    const result = await this.db.queryOne<{ role: UserTenantRole }>(
      `SELECT role FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return result?.role ?? null;
  }
}
```

**Step 2: Run tests to verify they pass**

```bash
bun test tests/unit/db/repositories/user-tenants.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/db/repositories/user-tenants.ts
git commit -m "feat(user-tenants): implement repository"
```

---

## Phase 4: Update Existing Repositories

### Task 4.1: Update SessionRepository

**Files:**
- Modify: `src/db/repositories/session.ts`
- Modify: `tests/unit/db/repositories/session.test.ts`

**Step 1: Add tests for new functionality**

Add to existing test file:

```typescript
describe("create with currentTenantId", () => {
  test("creates session with current_tenant_id", async () => {
    const sessionWithTenant = { ...mockSession, current_tenant_id: "tenant-123" };
    mocks.query.mockResolvedValueOnce([sessionWithTenant]);

    const result = await repo.create({
      user_id: "user-123",
      token: "token-abc",
      expires_at: new Date("2024-01-08"),
      current_tenant_id: "tenant-123",
    });

    expect(result.current_tenant_id).toBe("tenant-123");
  });
});

describe("updateCurrentTenant", () => {
  test("updates current_tenant_id", async () => {
    const updated = { ...mockSession, current_tenant_id: "tenant-456" };
    mocks.queryOne.mockResolvedValueOnce(updated);

    const result = await repo.updateCurrentTenant("token-abc", "tenant-456");

    expect(result?.current_tenant_id).toBe("tenant-456");
    expect(mocks.queryOne.mock.calls[0][0]).toContain("UPDATE sessions");
  });
});
```

**Step 2: Run tests to see them fail**

```bash
bun test tests/unit/db/repositories/session.test.ts
```

Expected: FAIL on new tests

**Step 3: Update SessionRepository implementation**

Update `CreateSessionInput`:

```typescript
export interface CreateSessionInput {
  user_id: string;
  token: string;
  expires_at: Date;
  current_tenant_id?: string;
}
```

Update `create` method:

```typescript
async create(input: CreateSessionInput): Promise<Session> {
  const results = await this.db.query<Session>(
    `INSERT INTO sessions (user_id, token, expires_at, current_tenant_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.user_id, input.token, input.expires_at, input.current_tenant_id ?? null]
  );
  const session = results[0];
  if (!session) {
    throw new Error("Failed to create session");
  }
  return session;
}
```

Add `updateCurrentTenant` method:

```typescript
async updateCurrentTenant(token: string, tenantId: string): Promise<Session | null> {
  return this.db.queryOne<Session>(
    `UPDATE sessions SET current_tenant_id = $2 WHERE token = $1 RETURNING *`,
    [token, tenantId]
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
bun test tests/unit/db/repositories/session.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/db/repositories/session.ts tests/unit/db/repositories/session.test.ts
git commit -m "feat(session): add current_tenant_id support"
```

---

### Task 4.2: Update UserRepository

**Files:**
- Modify: `src/db/repositories/user.ts`
- Modify: `tests/unit/db/repositories/user.test.ts`

**Step 1: Update CreateUserInput and queries**

Remove `tenant_id` from `CreateUserInput`, add `last_tenant_id`:

```typescript
export interface CreateUserInput {
  email: string;
  name?: string;
}
```

Update `create` method (remove notification fields, tenant_id):

```typescript
async create(input: CreateUserInput): Promise<User> {
  const results = await this.db.query<User>(
    `INSERT INTO users (email, name)
     VALUES ($1, $2)
     RETURNING *`,
    [input.email, input.name ?? null]
  );
  const user = results[0];
  if (!user) {
    throw new Error("Failed to create user");
  }
  return user;
}
```

Add `updateLastTenant` method:

```typescript
async updateLastTenant(userId: string, tenantId: string): Promise<User | null> {
  return this.db.queryOne<User>(
    `UPDATE users SET last_tenant_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, tenantId]
  );
}
```

**Step 2: Update tests accordingly**

Update test mocks and expectations to match new schema.

**Step 3: Run tests**

```bash
bun test tests/unit/db/repositories/user.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/db/repositories/user.ts tests/unit/db/repositories/user.test.ts
git commit -m "feat(user): remove tenant_id, add last_tenant_id"
```

---

### Task 4.3: Update TenantRepository

**Files:**
- Modify: `src/db/repositories/tenant.ts`
- Modify: `tests/unit/db/repositories/tenant.test.ts`

**Step 1: Add owner_id to CreateTenantInput**

```typescript
export interface CreateTenantInput {
  owner_id: string;
  name?: string;
  bsale_client_code?: string;
  bsale_client_name?: string;
  bsale_access_token?: string;
}
```

**Step 2: Update create method**

```typescript
async create(input: CreateTenantInput): Promise<Tenant> {
  const results = await this.db.query<TenantRow>(
    `INSERT INTO tenants (owner_id, name, bsale_client_code, bsale_client_name, bsale_access_token, sync_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.owner_id,
      input.name ?? null,
      input.bsale_client_code ?? null,
      input.bsale_client_name ?? null,
      input.bsale_access_token ? this.encryptToken(input.bsale_access_token) : null,
      input.bsale_client_code ? "pending" : "not_connected",
    ]
  );
  // ... rest of method
}
```

**Step 3: Add getByOwnerId method**

```typescript
async getByOwnerId(ownerId: string): Promise<Tenant[]> {
  const rows = await this.db.query<TenantRow>(
    `SELECT * FROM tenants WHERE owner_id = $1 ORDER BY created_at ASC`,
    [ownerId]
  );
  return rows.map((row) => this.decryptTenantRow(row));
}
```

**Step 4: Update tests and run**

```bash
bun test tests/unit/db/repositories/tenant.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/db/repositories/tenant.ts tests/unit/db/repositories/tenant.test.ts
git commit -m "feat(tenant): add owner_id support"
```

---

### Task 4.4: Update ThresholdRepository

**Files:**
- Modify: `src/db/repositories/threshold.ts`
- Modify: `tests/unit/db/repositories/threshold.test.ts`

**Step 1: Remove user_id, add created_by**

Update `CreateThresholdInput`:

```typescript
export interface CreateThresholdInput {
  tenant_id: string;
  bsale_variant_id: number;
  min_quantity: number;
  created_by?: string;
}
```

**Step 2: Update queries to remove user_id references**

All queries should filter by `tenant_id` only, not `user_id`.

**Step 3: Add countByTenant method** (for limit enforcement)

```typescript
async countByTenant(tenantId: string): Promise<number> {
  const result = await this.db.queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM thresholds WHERE tenant_id = $1`,
    [tenantId]
  );
  return parseInt(result?.count ?? "0", 10);
}
```

**Step 4: Update tests and run**

```bash
bun test tests/unit/db/repositories/threshold.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/db/repositories/threshold.ts tests/unit/db/repositories/threshold.test.ts
git commit -m "feat(threshold): make team-shared, add countByTenant"
```

---

### Task 4.5: Update AlertRepository

**Files:**
- Modify: `src/db/repositories/alert.ts`
- Modify: `tests/unit/db/repositories/alert.test.ts`

**Step 1: Remove user_id, add dismissed_by**

Update alert creation to not require user_id. Add `dismiss` method that sets `dismissed_by`:

```typescript
async dismiss(alertId: string, dismissedBy: string): Promise<Alert | null> {
  return this.db.queryOne<Alert>(
    `UPDATE alerts SET status = 'dismissed', dismissed_by = $2 WHERE id = $1 RETURNING *`,
    [alertId, dismissedBy]
  );
}
```

**Step 2: Update queries to filter by tenant_id only**

**Step 3: Update tests and run**

```bash
bun test tests/unit/db/repositories/alert.test.ts
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/db/repositories/alert.ts tests/unit/db/repositories/alert.test.ts
git commit -m "feat(alert): make team-shared, add dismissed_by"
```

---

## Phase 5: Auth Middleware Updates

### Task 5.1: Update AuthContext Interface

**Files:**
- Modify: `src/api/middleware/auth.ts`
- Modify: `tests/unit/api/middleware/auth.test.ts`

**Step 1: Update AuthContext interface**

```typescript
export interface AuthContext {
  userId: string;
  currentTenantId: string | null;
  role: UserTenantRole | null;
  refresh?: SessionRefresh;
}
```

**Step 2: Update authenticate method**

```typescript
async authenticate(request: Request): Promise<AuthContext> {
  const token = extractSessionToken(request);
  if (!token) {
    throw new AuthenticationError("No session token");
  }

  const session = await this.sessionRepo.findByToken(token);
  if (!session || session.expires_at < new Date()) {
    throw new AuthenticationError("Invalid or expired session");
  }

  let role: UserTenantRole | null = null;
  if (session.current_tenant_id) {
    role = await this.userTenantsRepo.getRole(session.user_id, session.current_tenant_id);
    if (!role) {
      // User no longer has access to this tenant
      throw new AuthenticationError("No access to current tenant");
    }
  }

  const refresh = this.checkRefreshNeeded(session);

  return {
    userId: session.user_id,
    currentTenantId: session.current_tenant_id,
    role,
    refresh,
  };
}
```

**Step 3: Update createAuthMiddleware to accept UserTenantsRepository**

```typescript
export function createAuthMiddleware(
  sessionRepo: SessionRepository,
  userTenantsRepo: UserTenantsRepository
): AuthMiddleware {
  // ...
}
```

**Step 4: Update tests**

**Step 5: Run tests**

```bash
bun test tests/unit/api/middleware/auth.test.ts
```

Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/api/middleware/auth.ts tests/unit/api/middleware/auth.test.ts
git commit -m "feat(auth): add currentTenantId and role to context"
```

---

## Phase 6: API Handlers

### Task 6.1: Create Tenant Switch Handler

**Files:**
- Create: `src/api/handlers/tenant-switch.ts`
- Create: `tests/unit/api/handlers/tenant-switch.test.ts`

**Step 1: Write tests**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { handleTenantSwitch } from "../../../../src/api/handlers/tenant-switch";

describe("handleTenantSwitch", () => {
  test("switches to tenant user has access to", async () => {
    const deps = createMockDeps();
    deps.userTenantsRepo.hasAccess.mockResolvedValueOnce(true);
    deps.sessionRepo.updateCurrentTenant.mockResolvedValueOnce({ current_tenant_id: "tenant-456" });
    deps.userRepo.updateLastTenant.mockResolvedValueOnce({});

    const result = await handleTenantSwitch(
      { tenantId: "tenant-456" },
      { userId: "user-123", sessionToken: "token-abc" },
      deps
    );

    expect(result.success).toBe(true);
    expect(deps.userTenantsRepo.hasAccess).toHaveBeenCalledWith("user-123", "tenant-456");
  });

  test("fails if user has no access to tenant", async () => {
    const deps = createMockDeps();
    deps.userTenantsRepo.hasAccess.mockResolvedValueOnce(false);

    await expect(
      handleTenantSwitch(
        { tenantId: "tenant-456" },
        { userId: "user-123", sessionToken: "token-abc" },
        deps
      )
    ).rejects.toThrow("No access to tenant");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/api/handlers/tenant-switch.test.ts
```

Expected: FAIL

**Step 3: Implement handler**

```typescript
import type { SessionRepository } from "../../db/repositories/session";
import type { UserRepository } from "../../db/repositories/user";
import type { UserTenantsRepository } from "../../db/repositories/user-tenants";

export interface TenantSwitchDeps {
  sessionRepo: SessionRepository;
  userRepo: UserRepository;
  userTenantsRepo: UserTenantsRepository;
}

export interface TenantSwitchInput {
  tenantId: string;
}

export interface TenantSwitchContext {
  userId: string;
  sessionToken: string;
}

export class TenantSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantSwitchError";
  }
}

export async function handleTenantSwitch(
  input: TenantSwitchInput,
  context: TenantSwitchContext,
  deps: TenantSwitchDeps
): Promise<{ success: true }> {
  const hasAccess = await deps.userTenantsRepo.hasAccess(context.userId, input.tenantId);
  if (!hasAccess) {
    throw new TenantSwitchError("No access to tenant");
  }

  await deps.sessionRepo.updateCurrentTenant(context.sessionToken, input.tenantId);
  await deps.userRepo.updateLastTenant(context.userId, input.tenantId);

  return { success: true };
}
```

**Step 4: Run tests**

```bash
bun test tests/unit/api/handlers/tenant-switch.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/api/handlers/tenant-switch.ts tests/unit/api/handlers/tenant-switch.test.ts
git commit -m "feat(api): add tenant switch handler"
```

---

### Task 6.2: Create Tenants List Handler

**Files:**
- Create: `src/api/handlers/tenants.ts`
- Create: `tests/unit/api/handlers/tenants.test.ts`

**Step 1: Write tests**

```typescript
describe("handleGetTenants", () => {
  test("returns user tenants with details", async () => {
    const deps = createMockDeps();
    deps.userTenantsRepo.getTenantsForUser.mockResolvedValueOnce([
      { tenant_id: "t1", role: "owner", tenant_name: "Store A", bsale_client_code: "123" },
      { tenant_id: "t2", role: "member", tenant_name: "Store B", bsale_client_code: "456" },
    ]);

    const result = await handleGetTenants({ userId: "user-123" }, deps);

    expect(result.tenants).toHaveLength(2);
    expect(result.tenants[0].role).toBe("owner");
  });
});
```

**Step 2: Implement and test**

**Step 3: Commit**

```bash
git add src/api/handlers/tenants.ts tests/unit/api/handlers/tenants.test.ts
git commit -m "feat(api): add tenants list handler"
```

---

### Task 6.3: Update Auth Me Handler

**Files:**
- Modify: `src/api/handlers/auth.ts` (or wherever `/api/auth/me` is handled)
- Modify: corresponding test file

**Step 1: Update response to include tenants list and current tenant**

Response shape:

```typescript
interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    subscriptionStatus: string;
    subscriptionPlan: string | null;
  };
  currentTenant: {
    id: string;
    name: string | null;
    bsaleClientCode: string | null;
    syncStatus: string;
  } | null;
  tenants: Array<{
    id: string;
    name: string | null;
    bsaleClientCode: string | null;
    role: string;
  }>;
  role: string | null;
}
```

**Step 2: Update tests and implementation**

**Step 3: Commit**

```bash
git commit -m "feat(auth): update /me endpoint with tenants list"
```

---

### Task 6.4: Update OAuth Handler for Add Tenant Flow

**Files:**
- Modify: `src/api/handlers/oauth.ts`
- Modify: `tests/unit/api/handlers/oauth.test.ts`

**Step 1: Add logic to detect authenticated user adding tenant**

In callback handler:
1. Check if user already authenticated (session exists)
2. If yes: create tenant with `owner_id = userId`, create `user_tenants` entry
3. If no: existing flow (create user, create tenant, create session)

**Step 2: Add conflict check for existing client_code**

```typescript
const existingTenant = await deps.tenantRepo.getByClientCode(clientCode);
if (existingTenant && existingTenant.owner_id !== userId) {
  throw new OAuthError("This Bsale account is already connected to another user");
}
```

**Step 3: Update tests**

**Step 4: Commit**

```bash
git commit -m "feat(oauth): support adding tenant to existing user"
```

---

## Phase 7: API Routes

### Task 7.1: Add Tenant Routes

**Files:**
- Create: `src/api/routes/tenants.ts`

**Step 1: Create route handlers**

```typescript
import { z } from "zod";
import type { AuthMiddleware } from "../middleware/auth";
import { handleGetTenants } from "../handlers/tenants";
import { handleTenantSwitch } from "../handlers/tenant-switch";

const switchTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

export function createTenantRoutes(deps: TenantRoutesDeps, authMiddleware: AuthMiddleware) {
  const authedRoute = createAuthedRoute(authMiddleware);

  return {
    list: authedRoute(async (request, context) => {
      const result = await handleGetTenants({ userId: context.userId }, deps);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),

    switch: authedRoute(async (request, context) => {
      const body = await request.json();
      const parsed = switchTenantSchema.parse(body);

      const sessionToken = extractSessionToken(request);
      await handleTenantSwitch(parsed, { userId: context.userId, sessionToken }, deps);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  };
}
```

**Step 2: Register routes in server.ts**

**Step 3: Commit**

```bash
git add src/api/routes/tenants.ts
git commit -m "feat(api): add tenant routes"
```

---

## Phase 8: Frontend Updates

### Task 8.1: Update Frontend Types

**Files:**
- Modify: `src/frontend/types.ts`

**Step 1: Add tenant types**

```typescript
export interface TenantMembership {
  id: string;
  name: string | null;
  bsaleClientCode: string | null;
  role: "owner" | "admin" | "member";
  syncStatus: string;
}

export interface CurrentTenant {
  id: string;
  name: string | null;
  bsaleClientCode: string | null;
  syncStatus: string;
}

export interface AuthMeResponse {
  user: User;
  currentTenant: CurrentTenant | null;
  tenants: TenantMembership[];
  role: string | null;
}
```

**Step 2: Commit**

```bash
git add src/frontend/types.ts
git commit -m "feat(frontend): add tenant types"
```

---

### Task 8.2: Update AuthContext

**Files:**
- Modify: `src/frontend/contexts/AuthContext.tsx`

**Step 1: Update AuthState**

```typescript
interface AuthState {
  user: User | null;
  currentTenant: CurrentTenant | null;
  tenants: TenantMembership[];
  role: string | null;
  loading: boolean;
  error: string | null;
}
```

**Step 2: Add switchTenant method**

```typescript
async function switchTenant(tenantId: string): Promise<void> {
  await api.post("/api/tenants/switch", { tenantId });
  await refreshAuth();
}
```

**Step 3: Update checkSession to use new response shape**

**Step 4: Commit**

```bash
git add src/frontend/contexts/AuthContext.tsx
git commit -m "feat(frontend): update AuthContext for multi-tenant"
```

---

### Task 8.3: Create TenantSwitcher Component

**Files:**
- Create: `src/frontend/components/TenantSwitcher.tsx`

**Step 1: Implement component**

```typescript
import { useAuth } from "../contexts/AuthContext";

export function TenantSwitcher() {
  const { currentTenant, tenants, switchTenant } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (tenants.length <= 1) {
    return null; // No switcher needed for single tenant
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100"
      >
        <span>{currentTenant?.name ?? currentTenant?.bsaleClientCode ?? "Select tenant"}</span>
        <ChevronDownIcon className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-md shadow-lg border">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              onClick={() => {
                switchTenant(tenant.id);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2 text-left hover:bg-gray-50 ${
                tenant.id === currentTenant?.id ? "bg-blue-50" : ""
              }`}
            >
              <div className="font-medium">{tenant.name ?? tenant.bsaleClientCode}</div>
              <div className="text-sm text-gray-500">{tenant.role}</div>
            </button>
          ))}

          <div className="border-t">
            <a
              href="/settings/accounts"
              className="block px-4 py-2 text-blue-600 hover:bg-gray-50"
            >
              + Add Account
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add to Header component**

**Step 3: Commit**

```bash
git add src/frontend/components/TenantSwitcher.tsx
git commit -m "feat(frontend): add TenantSwitcher component"
```

---

### Task 8.4: Update Header Component

**Files:**
- Modify: `src/frontend/components/Header.tsx`

**Step 1: Add TenantSwitcher to header**

**Step 2: Commit**

```bash
git add src/frontend/components/Header.tsx
git commit -m "feat(frontend): add tenant switcher to header"
```

---

### Task 8.5: Create Onboarding Page

**Files:**
- Create: `src/frontend/pages/Onboarding.tsx`

**Step 1: Create simple onboarding for users with no tenants**

```typescript
export function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center mb-6">
          Connect Your Bsale Account
        </h1>
        <p className="text-gray-600 text-center mb-8">
          To get started, connect your Bsale account to enable stock alerts.
        </p>
        <a
          href="/api/auth/bsale/connect"
          className="block w-full py-3 px-4 bg-blue-600 text-white text-center rounded-md hover:bg-blue-700"
        >
          Connect Bsale Account
        </a>
      </div>
    </div>
  );
}
```

**Step 2: Update routing to redirect users with no tenants**

**Step 3: Commit**

```bash
git add src/frontend/pages/Onboarding.tsx
git commit -m "feat(frontend): add onboarding page"
```

---

## Phase 9: Update Limit Enforcement

### Task 9.1: Update ThresholdLimitService

**Files:**
- Modify: `src/billing/threshold-limit-service.ts`
- Modify: `tests/unit/billing/threshold-limit-service.test.ts`

**Step 1: Change from per-user to per-tenant limits**

```typescript
async getTenantLimitInfo(tenantId: string): Promise<LimitInfo> {
  const tenant = await this.tenantRepo.getById(tenantId);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const owner = await this.userRepo.getById(tenant.owner_id);
  if (!owner) {
    throw new Error("Tenant owner not found");
  }

  const plan = this.getPlanForUser(owner);
  const currentCount = await this.thresholdRepo.countByTenant(tenantId);

  return {
    plan,
    currentCount,
    maxAllowed: plan.maxThresholds,
    remaining: Math.max(0, plan.maxThresholds - currentCount),
    isOverLimit: currentCount > plan.maxThresholds,
  };
}
```

**Step 2: Update tests**

**Step 3: Commit**

```bash
git add src/billing/threshold-limit-service.ts tests/unit/billing/threshold-limit-service.test.ts
git commit -m "feat(billing): change limits to per-tenant based on owner"
```

---

## Phase 10: Integration Testing

### Task 10.1: Add Integration Tests

**Files:**
- Create: `tests/integration/multi-tenant.test.ts`

**Step 1: Write integration tests**

```typescript
describe("Multi-tenant user flows", () => {
  test("user can create multiple tenants", async () => {
    // Create user
    // Create first tenant via OAuth
    // Create second tenant via OAuth
    // Verify user has two tenants
  });

  test("user can switch between tenants", async () => {
    // Setup user with two tenants
    // Switch to tenant 2
    // Verify session updated
    // Verify last_tenant_id updated
  });

  test("thresholds are shared within tenant", async () => {
    // Setup tenant with two users
    // User A creates threshold
    // User B can see and edit threshold
  });

  test("threshold limits based on owner plan", async () => {
    // Create tenant with FREE owner
    // Create 50 thresholds
    // Verify 51st fails with limit error
  });
});
```

**Step 2: Run integration tests**

```bash
bun test tests/integration/multi-tenant.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add tests/integration/multi-tenant.test.ts
git commit -m "test: add multi-tenant integration tests"
```

---

## Phase 11: Final Cleanup

### Task 11.1: Update Server Dependencies

**Files:**
- Modify: `src/server.ts`

**Step 1: Add UserTenantsRepository to server dependencies**

**Step 2: Wire up new routes**

**Step 3: Commit**

```bash
git commit -m "feat(server): wire up multi-tenant routes and dependencies"
```

---

### Task 11.2: Run Full Test Suite

**Step 1: Run all tests**

```bash
bun test
```

Expected: All tests PASS

**Step 2: Run type check**

```bash
bun run typecheck
```

Expected: No errors

**Step 3: Run linter**

```bash
bun run lint
```

Expected: No errors

---

### Task 11.3: Final Commit

```bash
git add -A
git commit -m "feat: complete multi-tenant users implementation"
```

---

## Summary

This plan implements:
1. Database schema with `user_tenants` junction table
2. `UserTenantsRepository` for membership management
3. Updated repositories (session, user, tenant, threshold, alert)
4. Auth middleware with `currentTenantId` and `role`
5. Tenant switch and list API endpoints
6. Frontend tenant switcher component
7. Per-tenant threshold limits based on owner's plan
8. Integration tests

Total tasks: ~25 bite-sized steps across 11 phases.
