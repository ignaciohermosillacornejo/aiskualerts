# Freemium Threshold Limits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement per-user threshold limits (50 free, unlimited pro) with soft blocking - users can create unlimited thresholds but only first 50 trigger alerts.

**Architecture:** Subscription tracking moves from tenant to user level. Thresholds are queried across all tenants a user belongs to, ordered by `created_at`. Alert generation and email digests enforce the limit by only processing the first 50 thresholds for free users.

**Tech Stack:** Bun, PostgreSQL (raw SQL), TypeScript, Zod validation, MercadoPago billing

---

## Task 1: Add Plan Constants

**Files:**
- Create: `src/billing/plans.ts`
- Test: `tests/unit/billing/plans.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/billing/plans.test.ts
import { describe, test, expect } from "bun:test";
import { PLANS, getPlanForUser } from "@/billing/plans";

describe("Plans", () => {
  describe("PLANS constant", () => {
    test("FREE plan has 50 threshold limit", () => {
      expect(PLANS.FREE.maxThresholds).toBe(50);
    });

    test("PRO plan has unlimited thresholds", () => {
      expect(PLANS.PRO.maxThresholds).toBe(Infinity);
    });
  });

  describe("getPlanForUser", () => {
    test("returns FREE for user with no subscription", () => {
      const user = { subscription_status: "none" } as { subscription_status: string };
      expect(getPlanForUser(user)).toBe(PLANS.FREE);
    });

    test("returns PRO for user with active subscription", () => {
      const user = { subscription_status: "active" } as { subscription_status: string };
      expect(getPlanForUser(user)).toBe(PLANS.PRO);
    });

    test("returns PRO for cancelled user within grace period", () => {
      const user = {
        subscription_status: "cancelled",
        subscription_ends_at: new Date(Date.now() + 86400000), // tomorrow
      } as { subscription_status: string; subscription_ends_at: Date | null };
      expect(getPlanForUser(user)).toBe(PLANS.PRO);
    });

    test("returns FREE for cancelled user past grace period", () => {
      const user = {
        subscription_status: "cancelled",
        subscription_ends_at: new Date(Date.now() - 86400000), // yesterday
      } as { subscription_status: string; subscription_ends_at: Date | null };
      expect(getPlanForUser(user)).toBe(PLANS.FREE);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/billing/plans.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/billing/plans.ts
export interface Plan {
  readonly name: "FREE" | "PRO";
  readonly maxThresholds: number;
}

export const PLANS = {
  FREE: { name: "FREE", maxThresholds: 50 } as const,
  PRO: { name: "PRO", maxThresholds: Infinity } as const,
} as const;

export type PlanName = keyof typeof PLANS;

interface UserWithSubscription {
  subscription_status: string;
  subscription_ends_at?: Date | null;
}

export function getPlanForUser(user: UserWithSubscription): Plan {
  if (user.subscription_status === "active") {
    return PLANS.PRO;
  }
  if (user.subscription_status === "cancelled" && user.subscription_ends_at) {
    if (user.subscription_ends_at > new Date()) {
      return PLANS.PRO;
    }
  }
  return PLANS.FREE;
}

export function isUserPaid(user: UserWithSubscription): boolean {
  return getPlanForUser(user) === PLANS.PRO;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/billing/plans.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/billing/plans.ts tests/unit/billing/plans.test.ts
git commit -m "feat(billing): add plan constants and getPlanForUser helper"
```

---

## Task 2: Database Migration - Move Subscription to Users

**Files:**
- Create: `src/db/migrations/007_user_subscriptions.sql`
- Test: Migration runs without error

**Step 1: Write the migration**

```sql
-- 007_user_subscriptions.sql
-- Move subscription tracking from tenant to user level

-- Add subscription columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Add constraint for subscription_status
ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN ('none', 'active', 'cancelled', 'past_due'));

-- Create index for subscription lookups
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Migrate existing tenant subscriptions to primary user of each tenant
UPDATE users u
SET
  subscription_id = t.subscription_id,
  subscription_status = t.subscription_status,
  subscription_ends_at = t.subscription_ends_at
FROM tenants t
WHERE u.tenant_id = t.id
  AND t.subscription_id IS NOT NULL
  AND u.id = (
    SELECT id FROM users
    WHERE tenant_id = t.id
    ORDER BY created_at ASC
    LIMIT 1
  );

-- Note: We keep tenant subscription columns for now (backwards compatibility)
-- They will be removed in a future migration after verification
```

**Step 2: Run migration**

Run: `bun run src/db/migrate.ts`
Expected: Migration applied successfully

**Step 3: Verify migration**

Run: `psql $DATABASE_URL -c "\\d users"` (or via bun script)
Expected: New columns visible in schema

**Step 4: Commit**

```bash
git add src/db/migrations/007_user_subscriptions.sql
git commit -m "feat(db): add subscription columns to users table"
```

---

## Task 3: Update User Types and Repository

**Files:**
- Modify: `src/db/repositories/types.ts`
- Modify: `src/db/repositories/user.ts`
- Test: `tests/unit/db/repositories/user.test.ts`

**Step 1: Write failing tests for new user methods**

Add to `tests/unit/db/repositories/user.test.ts`:

```typescript
describe("subscription methods", () => {
  test("activateSubscription sets subscription columns", async () => {
    const mockDb = {
      query: mock(() => Promise.resolve([{ id: "user-1" }])),
    };
    const repo = createUserRepository(mockDb as unknown as DatabaseClient);

    await repo.activateSubscription("user-1", "sub_123");

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("subscription_id"),
      expect.arrayContaining(["user-1", "sub_123", "active"])
    );
  });

  test("updateSubscriptionStatus updates status and ends_at", async () => {
    const mockDb = {
      query: mock(() => Promise.resolve([{ id: "user-1" }])),
    };
    const repo = createUserRepository(mockDb as unknown as DatabaseClient);
    const endsAt = new Date("2026-02-01");

    await repo.updateSubscriptionStatus("sub_123", "cancelled", endsAt);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("subscription_status"),
      expect.arrayContaining(["cancelled", endsAt, "sub_123"])
    );
  });

  test("findBySubscriptionId returns user with subscription", async () => {
    const mockUser = {
      id: "user-1",
      subscription_id: "sub_123",
      subscription_status: "active",
    };
    const mockDb = {
      query: mock(() => Promise.resolve([mockUser])),
    };
    const repo = createUserRepository(mockDb as unknown as DatabaseClient);

    const result = await repo.findBySubscriptionId("sub_123");

    expect(result).toEqual(mockUser);
  });

  test("findBySubscriptionId returns null when not found", async () => {
    const mockDb = {
      query: mock(() => Promise.resolve([])),
    };
    const repo = createUserRepository(mockDb as unknown as DatabaseClient);

    const result = await repo.findBySubscriptionId("nonexistent");

    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/db/repositories/user.test.ts`
Expected: FAIL - methods don't exist

**Step 3: Update User type**

In `src/db/repositories/types.ts`, update User interface:

```typescript
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string | null;
  notification_enabled: boolean;
  notification_email: string | null;
  digest_frequency: DigestFrequency;
  // Subscription (user-level)
  subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: Date | null;
  created_at: Date;
}
```

**Step 4: Add repository methods**

In `src/db/repositories/user.ts`, add:

```typescript
async activateSubscription(
  userId: string,
  subscriptionId: string
): Promise<void> {
  await this.db.query(
    `UPDATE users
     SET subscription_id = $2,
         subscription_status = $3,
         subscription_ends_at = NULL
     WHERE id = $1`,
    [userId, subscriptionId, "active"]
  );
}

async updateSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
  endsAt?: Date
): Promise<void> {
  await this.db.query(
    `UPDATE users
     SET subscription_status = $1,
         subscription_ends_at = $2
     WHERE subscription_id = $3`,
    [status, endsAt ?? null, subscriptionId]
  );
}

async findBySubscriptionId(subscriptionId: string): Promise<User | null> {
  const rows = await this.db.query<User>(
    `SELECT * FROM users WHERE subscription_id = $1`,
    [subscriptionId]
  );
  return rows[0] ?? null;
}
```

**Step 5: Run tests to verify they pass**

Run: `bun test tests/unit/db/repositories/user.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/db/repositories/types.ts src/db/repositories/user.ts tests/unit/db/repositories/user.test.ts
git commit -m "feat(db): add subscription methods to user repository"
```

---

## Task 4: Add Cross-Tenant Threshold Queries

**Files:**
- Modify: `src/db/repositories/threshold.ts`
- Test: `tests/unit/db/repositories/threshold.test.ts`

**Step 1: Write failing tests**

Add to `tests/unit/db/repositories/threshold.test.ts`:

```typescript
describe("cross-tenant queries", () => {
  test("countByUserAcrossTenants counts thresholds across all tenants", async () => {
    const mockDb = {
      query: mock(() => Promise.resolve([{ count: "25" }])),
    };
    const repo = createThresholdRepository(mockDb as unknown as DatabaseClient);

    const count = await repo.countByUserAcrossTenants("user-1");

    expect(count).toBe(25);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("user_id = $1"),
      ["user-1"]
    );
  });

  test("getActiveThresholdsForUser returns first N thresholds ordered by created_at", async () => {
    const mockThresholds = [
      { id: "t1", created_at: new Date("2026-01-01") },
      { id: "t2", created_at: new Date("2026-01-02") },
    ];
    const mockDb = {
      query: mock(() => Promise.resolve(mockThresholds)),
    };
    const repo = createThresholdRepository(mockDb as unknown as DatabaseClient);

    const result = await repo.getActiveThresholdsForUser("user-1", 50);

    expect(result).toEqual(mockThresholds);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY created_at ASC"),
      expect.arrayContaining(["user-1", 50])
    );
  });

  test("getActiveThresholdsForUser returns all when limit is undefined", async () => {
    const mockDb = {
      query: mock(() => Promise.resolve([])),
    };
    const repo = createThresholdRepository(mockDb as unknown as DatabaseClient);

    await repo.getActiveThresholdsForUser("user-1", undefined);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.not.stringContaining("LIMIT"),
      ["user-1"]
    );
  });

  test("getSkippedThresholdsForUser returns thresholds after offset", async () => {
    const mockDb = {
      query: mock(() => Promise.resolve([{ id: "t51" }])),
    };
    const repo = createThresholdRepository(mockDb as unknown as DatabaseClient);

    const result = await repo.getSkippedThresholdsForUser("user-1", 50);

    expect(result).toHaveLength(1);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("OFFSET $2"),
      ["user-1", 50]
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/db/repositories/threshold.test.ts`
Expected: FAIL - methods don't exist

**Step 3: Implement repository methods**

In `src/db/repositories/threshold.ts`, add:

```typescript
async countByUserAcrossTenants(userId: string): Promise<number> {
  const rows = await this.db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM thresholds WHERE user_id = $1`,
    [userId]
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}

async getActiveThresholdsForUser(
  userId: string,
  limit?: number
): Promise<Threshold[]> {
  if (limit === undefined) {
    return this.db.query<Threshold>(
      `SELECT * FROM thresholds
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );
  }
  return this.db.query<Threshold>(
    `SELECT * FROM thresholds
     WHERE user_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [userId, limit]
  );
}

async getSkippedThresholdsForUser(
  userId: string,
  offset: number
): Promise<Threshold[]> {
  return this.db.query<Threshold>(
    `SELECT * FROM thresholds
     WHERE user_id = $1
     ORDER BY created_at ASC
     OFFSET $2`,
    [userId, offset]
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/db/repositories/threshold.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db/repositories/threshold.ts tests/unit/db/repositories/threshold.test.ts
git commit -m "feat(db): add cross-tenant threshold queries for user limits"
```

---

## Task 5: Create Threshold Limit Service

**Files:**
- Create: `src/billing/threshold-limit-service.ts`
- Test: `tests/unit/billing/threshold-limit-service.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/unit/billing/threshold-limit-service.test.ts
import { describe, test, expect, mock } from "bun:test";
import { createThresholdLimitService } from "@/billing/threshold-limit-service";
import { PLANS } from "@/billing/plans";

describe("ThresholdLimitService", () => {
  const createMockDeps = (overrides = {}) => ({
    userRepo: {
      findById: mock(() => Promise.resolve(null)),
      ...overrides.userRepo,
    },
    thresholdRepo: {
      countByUserAcrossTenants: mock(() => Promise.resolve(0)),
      getActiveThresholdsForUser: mock(() => Promise.resolve([])),
      getSkippedThresholdsForUser: mock(() => Promise.resolve([])),
      ...overrides.thresholdRepo,
    },
  });

  describe("getUserLimitInfo", () => {
    test("returns FREE plan info for user without subscription", async () => {
      const deps = createMockDeps({
        userRepo: {
          findById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          countByUserAcrossTenants: mock(() => Promise.resolve(25)),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getUserLimitInfo("user-1");

      expect(result).toEqual({
        plan: PLANS.FREE,
        currentCount: 25,
        maxAllowed: 50,
        remaining: 25,
        isOverLimit: false,
      });
    });

    test("returns PRO plan info for user with active subscription", async () => {
      const deps = createMockDeps({
        userRepo: {
          findById: mock(() =>
            Promise.resolve({ subscription_status: "active" })
          ),
        },
        thresholdRepo: {
          countByUserAcrossTenants: mock(() => Promise.resolve(100)),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getUserLimitInfo("user-1");

      expect(result).toEqual({
        plan: PLANS.PRO,
        currentCount: 100,
        maxAllowed: Infinity,
        remaining: Infinity,
        isOverLimit: false,
      });
    });

    test("returns isOverLimit true when free user exceeds 50", async () => {
      const deps = createMockDeps({
        userRepo: {
          findById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          countByUserAcrossTenants: mock(() => Promise.resolve(60)),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getUserLimitInfo("user-1");

      expect(result.isOverLimit).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  describe("getActiveThresholdIds", () => {
    test("returns all threshold IDs for PRO user", async () => {
      const deps = createMockDeps({
        userRepo: {
          findById: mock(() =>
            Promise.resolve({ subscription_status: "active" })
          ),
        },
        thresholdRepo: {
          getActiveThresholdsForUser: mock(() =>
            Promise.resolve([{ id: "t1" }, { id: "t2" }, { id: "t3" }])
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getActiveThresholdIds("user-1");

      expect(result).toEqual(new Set(["t1", "t2", "t3"]));
      expect(deps.thresholdRepo.getActiveThresholdsForUser).toHaveBeenCalledWith(
        "user-1",
        undefined
      );
    });

    test("returns first 50 threshold IDs for FREE user", async () => {
      const deps = createMockDeps({
        userRepo: {
          findById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          getActiveThresholdsForUser: mock(() =>
            Promise.resolve([{ id: "t1" }, { id: "t2" }])
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getActiveThresholdIds("user-1");

      expect(deps.thresholdRepo.getActiveThresholdsForUser).toHaveBeenCalledWith(
        "user-1",
        50
      );
    });
  });

  describe("getSkippedCount", () => {
    test("returns 0 for PRO user", async () => {
      const deps = createMockDeps({
        userRepo: {
          findById: mock(() =>
            Promise.resolve({ subscription_status: "active" })
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getSkippedCount("user-1");

      expect(result).toBe(0);
    });

    test("returns count of thresholds beyond 50 for FREE user", async () => {
      const deps = createMockDeps({
        userRepo: {
          findById: mock(() =>
            Promise.resolve({ subscription_status: "none" })
          ),
        },
        thresholdRepo: {
          getSkippedThresholdsForUser: mock(() =>
            Promise.resolve([{ id: "t51" }, { id: "t52" }])
          ),
        },
      });
      const service = createThresholdLimitService(deps);

      const result = await service.getSkippedCount("user-1");

      expect(result).toBe(2);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/billing/threshold-limit-service.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the service**

```typescript
// src/billing/threshold-limit-service.ts
import { PLANS, getPlanForUser, type Plan } from "./plans";
import type { UserRepository } from "@/db/repositories/user";
import type { ThresholdRepository } from "@/db/repositories/threshold";

export interface LimitInfo {
  plan: Plan;
  currentCount: number;
  maxAllowed: number;
  remaining: number;
  isOverLimit: boolean;
}

export interface ThresholdLimitServiceDeps {
  userRepo: Pick<UserRepository, "findById">;
  thresholdRepo: Pick<
    ThresholdRepository,
    "countByUserAcrossTenants" | "getActiveThresholdsForUser" | "getSkippedThresholdsForUser"
  >;
}

export interface ThresholdLimitService {
  getUserLimitInfo(userId: string): Promise<LimitInfo>;
  getActiveThresholdIds(userId: string): Promise<Set<string>>;
  getSkippedCount(userId: string): Promise<number>;
}

export function createThresholdLimitService(
  deps: ThresholdLimitServiceDeps
): ThresholdLimitService {
  const { userRepo, thresholdRepo } = deps;

  return {
    async getUserLimitInfo(userId: string): Promise<LimitInfo> {
      const user = await userRepo.findById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const plan = getPlanForUser(user);
      const currentCount = await thresholdRepo.countByUserAcrossTenants(userId);
      const maxAllowed = plan.maxThresholds;
      const isOverLimit = currentCount > maxAllowed;
      const remaining = isOverLimit ? 0 : maxAllowed - currentCount;

      return {
        plan,
        currentCount,
        maxAllowed,
        remaining: maxAllowed === Infinity ? Infinity : remaining,
        isOverLimit,
      };
    },

    async getActiveThresholdIds(userId: string): Promise<Set<string>> {
      const user = await userRepo.findById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const plan = getPlanForUser(user);
      const limit = plan.maxThresholds === Infinity ? undefined : plan.maxThresholds;
      const thresholds = await thresholdRepo.getActiveThresholdsForUser(userId, limit);

      return new Set(thresholds.map((t) => t.id));
    },

    async getSkippedCount(userId: string): Promise<number> {
      const user = await userRepo.findById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const plan = getPlanForUser(user);
      if (plan.maxThresholds === Infinity) {
        return 0;
      }

      const skipped = await thresholdRepo.getSkippedThresholdsForUser(
        userId,
        plan.maxThresholds
      );
      return skipped.length;
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/billing/threshold-limit-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/billing/threshold-limit-service.ts tests/unit/billing/threshold-limit-service.test.ts
git commit -m "feat(billing): add threshold limit service for freemium enforcement"
```

---

## Task 6: Update Billing Handlers for User-Level Subscriptions

**Files:**
- Modify: `src/api/handlers/billing.ts`
- Test: `tests/unit/api/handlers/billing.test.ts`

**Step 1: Update tests to use user instead of tenant**

Modify existing tests in `tests/unit/api/handlers/billing.test.ts` to:
- Mock `userRepo` instead of `tenantRepo` for subscription lookups
- Pass `userId` from auth context to checkout/cancel handlers
- Update assertions to check user subscription status

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/api/handlers/billing.test.ts`
Expected: FAIL - handlers still use tenant

**Step 3: Update billing handlers**

Key changes in `src/api/handlers/billing.ts`:

```typescript
// Checkout handler - create subscription for user
export async function handleCheckout(
  req: Request,
  deps: BillingHandlerDeps
): Promise<Response> {
  const { userId, tenantId } = getAuthContext(req);
  const user = await deps.userRepo.findById(userId);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (isUserPaid(user)) {
    return Response.json({ error: "Already subscribed" }, { status: 400 });
  }

  const checkoutUrl = await deps.mercadoPagoClient.createSubscription(
    userId, // Changed from tenantId
    user.email
  );

  return Response.json({ url: checkoutUrl });
}

// Webhook handler - update user subscription status
export async function handleWebhook(
  req: Request,
  deps: BillingHandlerDeps
): Promise<Response> {
  // ... validation ...

  const result = await deps.mercadoPagoClient.processWebhookEvent(type, dataId);

  switch (result.type) {
    case "subscription_authorized":
      await deps.userRepo.activateSubscription(result.userId, result.subscriptionId);
      break;
    case "subscription_cancelled":
      await deps.userRepo.updateSubscriptionStatus(
        result.subscriptionId,
        "cancelled",
        result.endsAt
      );
      break;
  }

  return new Response("OK", { status: 200 });
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/api/handlers/billing.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/api/handlers/billing.ts tests/unit/api/handlers/billing.test.ts
git commit -m "feat(billing): update handlers for user-level subscriptions"
```

---

## Task 7: Update MercadoPago Client for User Subscriptions

**Files:**
- Modify: `src/billing/mercadopago.ts`
- Test: `tests/unit/billing/mercadopago.test.ts`

**Step 1: Update tests**

Modify tests to expect `userId` instead of `tenantId` in subscription metadata.

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/billing/mercadopago.test.ts`
Expected: FAIL

**Step 3: Update MercadoPago client**

In `src/billing/mercadopago.ts`, change:

```typescript
async createSubscription(userId: string, email: string): Promise<string> {
  // ... validation ...

  const preapproval = await this.client.preapproval.create({
    body: {
      // ... other fields ...
      external_reference: userId, // Changed from tenantId
    },
  });

  return preapproval.init_point!;
}

async processWebhookEvent(type: string, dataId: string): Promise<WebhookResult> {
  // ... fetch preapproval ...

  if (preapproval.status === "authorized") {
    return {
      type: "subscription_authorized",
      subscriptionId: preapproval.id!,
      userId: preapproval.external_reference!, // Changed from tenantId
    };
  }

  // ... rest of handling ...
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/billing/mercadopago.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/billing/mercadopago.ts tests/unit/billing/mercadopago.test.ts
git commit -m "feat(billing): update MercadoPago client for user subscriptions"
```

---

## Task 8: Update Email Digest to Show Skipped Thresholds

**Files:**
- Modify: `src/jobs/digest-job.ts`
- Modify: `src/email/templates/daily-digest.ts`
- Test: `tests/unit/jobs/digest-job.test.ts`
- Test: `tests/unit/email/templates/daily-digest.test.ts`

**Step 1: Write failing tests for digest with skipped count**

Add to `tests/unit/jobs/digest-job.test.ts`:

```typescript
describe("freemium limits", () => {
  test("includes skipped threshold count for free users", async () => {
    const mockDeps = createMockDeps({
      thresholdLimitService: {
        getSkippedCount: mock(() => Promise.resolve(12)),
      },
    });
    // ... setup user with alerts ...

    const result = await runDigestJob(mockDeps, "daily");

    expect(mockDeps.emailClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("12 thresholds"),
      })
    );
  });

  test("does not include skipped section for pro users", async () => {
    const mockDeps = createMockDeps({
      thresholdLimitService: {
        getSkippedCount: mock(() => Promise.resolve(0)),
      },
    });
    // ... setup pro user with alerts ...

    const result = await runDigestJob(mockDeps, "daily");

    expect(mockDeps.emailClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.not.stringContaining("Skipped Due to Free Plan"),
      })
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/jobs/digest-job.test.ts`
Expected: FAIL

**Step 3: Update digest email template**

In `src/email/templates/daily-digest.ts`:

```typescript
export interface DigestEmailParams {
  tenantName: string;
  date: Date;
  alerts: AlertSummary[];
  skippedThresholdCount?: number; // New field
  upgradeUrl?: string; // New field
}

export function renderDailyDigestEmail(params: DigestEmailParams): string {
  const { alerts, skippedThresholdCount, upgradeUrl } = params;

  // ... existing alert rendering ...

  // Add skipped section if applicable
  let skippedSection = "";
  if (skippedThresholdCount && skippedThresholdCount > 0) {
    skippedSection = `
      <div style="margin-top: 24px; padding: 16px; background-color: #fef3c7; border-radius: 8px;">
        <h3 style="margin: 0 0 8px 0; color: #92400e;">
          Skipped Due to Free Plan Limit
        </h3>
        <p style="margin: 0; color: #78350f;">
          You have ${skippedThresholdCount} threshold${skippedThresholdCount === 1 ? "" : "s"}
          that ${skippedThresholdCount === 1 ? "isn't" : "aren't"} generating alerts.
          Upgrade to Pro for unlimited threshold monitoring.
        </p>
        ${upgradeUrl ? `
          <a href="${upgradeUrl}"
             style="display: inline-block; margin-top: 12px; padding: 8px 16px;
                    background-color: #f59e0b; color: white; text-decoration: none;
                    border-radius: 4px; font-weight: 500;">
            Upgrade to Pro
          </a>
        ` : ""}
      </div>
    `;
  }

  return `
    <!-- existing template -->
    ${skippedSection}
  `;
}
```

**Step 4: Update digest job**

In `src/jobs/digest-job.ts`:

```typescript
// Add thresholdLimitService to dependencies
export interface DigestJobDependencies {
  db: DatabaseClient;
  config: Config;
  emailClient: EmailClient;
  thresholdLimitService: ThresholdLimitService; // New
}

// In the job, for each user:
const skippedCount = await deps.thresholdLimitService.getSkippedCount(user.id);

const html = renderDailyDigestEmail({
  tenantName: tenant.bsale_client_name ?? "Your Store",
  date: new Date(),
  alerts: userAlerts,
  skippedThresholdCount: skippedCount,
  upgradeUrl: skippedCount > 0 ? `${deps.config.appUrl}/settings/billing` : undefined,
});
```

**Step 5: Run tests to verify they pass**

Run: `bun test tests/unit/jobs/digest-job.test.ts tests/unit/email/templates/daily-digest.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/jobs/digest-job.ts src/email/templates/daily-digest.ts \
        tests/unit/jobs/digest-job.test.ts tests/unit/email/templates/daily-digest.test.ts
git commit -m "feat(digest): show skipped threshold count for free users"
```

---

## Task 9: Add API Endpoint for User Limit Info

**Files:**
- Modify: `src/api/routes/settings.ts`
- Test: `tests/unit/api/routes/settings.test.ts`

**Step 1: Write failing test**

Add to `tests/unit/api/routes/settings.test.ts`:

```typescript
describe("GET /api/settings/limits", () => {
  test("returns user limit info", async () => {
    const mockLimitInfo = {
      plan: PLANS.FREE,
      currentCount: 45,
      maxAllowed: 50,
      remaining: 5,
      isOverLimit: false,
    };
    const mockDeps = createMockDeps({
      thresholdLimitService: {
        getUserLimitInfo: mock(() => Promise.resolve(mockLimitInfo)),
      },
    });

    const response = await handleGetLimits(
      createAuthenticatedRequest("user-1"),
      mockDeps
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      plan: "FREE",
      thresholds: {
        current: 45,
        max: 50,
        remaining: 5,
        isOverLimit: false,
      },
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/api/routes/settings.test.ts`
Expected: FAIL

**Step 3: Implement the endpoint**

In `src/api/routes/settings.ts`:

```typescript
export async function handleGetLimits(
  req: Request,
  deps: SettingsHandlerDeps
): Promise<Response> {
  const { userId } = getAuthContext(req);

  const limitInfo = await deps.thresholdLimitService.getUserLimitInfo(userId);

  return Response.json({
    plan: limitInfo.plan.name,
    thresholds: {
      current: limitInfo.currentCount,
      max: limitInfo.maxAllowed === Infinity ? null : limitInfo.maxAllowed,
      remaining: limitInfo.remaining === Infinity ? null : limitInfo.remaining,
      isOverLimit: limitInfo.isOverLimit,
    },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/api/routes/settings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/api/routes/settings.ts tests/unit/api/routes/settings.test.ts
git commit -m "feat(api): add endpoint for user threshold limits"
```

---

## Task 10: Update Subscription Service for User-Level Checks

**Files:**
- Modify: `src/billing/subscription-service.ts`
- Test: `tests/unit/billing/subscription-service.test.ts`

**Step 1: Update tests to use user instead of tenant**

Change all tests to use `User` type instead of `Tenant` for subscription checks.

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/billing/subscription-service.test.ts`
Expected: FAIL

**Step 3: Update subscription service**

In `src/billing/subscription-service.ts`:

```typescript
import type { User } from "@/db/repositories/types";

export interface SubscriptionServiceDeps {
  mercadoPagoClient: MercadoPagoClient;
  userRepo: UserRepository; // Changed from tenantRepo
}

export async function hasActiveAccess(
  user: User,
  deps: SubscriptionServiceDeps
): Promise<boolean> {
  // Same logic, but using user instead of tenant
  if (!user.subscription_id) return false;
  if (user.subscription_status === "active") return true;
  // ... rest of logic using user fields
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/billing/subscription-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/billing/subscription-service.ts tests/unit/billing/subscription-service.test.ts
git commit -m "feat(billing): update subscription service for user-level checks"
```

---

## Task 11: Wire Up Dependencies in Main Entry Point

**Files:**
- Modify: `src/index.ts`
- Test: Run full test suite

**Step 1: Update dependency injection**

In `src/index.ts`, add:

```typescript
import { createThresholdLimitService } from "@/billing/threshold-limit-service";

// In createDependencies():
const thresholdLimitService = createThresholdLimitService({
  userRepo,
  thresholdRepo,
});

// Pass to handlers that need it
const digestJobDeps = {
  db,
  config,
  emailClient,
  thresholdLimitService, // New
};
```

**Step 2: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up threshold limit service in dependency injection"
```

---

## Task 12: Run Full Integration Test

**Files:** None (verification only)

**Step 1: Run type check**

Run: `tsc --noEmit`
Expected: No errors

**Step 2: Run linter**

Run: `eslint .`
Expected: No errors

**Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 4: Commit any fixes**

If any issues found, fix and commit.

---

## Summary of Changes

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/billing/plans.ts` | New | Plan constants and helpers |
| `src/billing/threshold-limit-service.ts` | New | Freemium limit enforcement |
| `src/db/migrations/007_user_subscriptions.sql` | New | Move subscriptions to users |
| `src/db/repositories/types.ts` | Modified | Add subscription fields to User |
| `src/db/repositories/user.ts` | Modified | Add subscription methods |
| `src/db/repositories/threshold.ts` | Modified | Add cross-tenant queries |
| `src/billing/mercadopago.ts` | Modified | Use userId instead of tenantId |
| `src/billing/subscription-service.ts` | Modified | Check user not tenant |
| `src/api/handlers/billing.ts` | Modified | User-level billing |
| `src/api/routes/settings.ts` | Modified | Add limits endpoint |
| `src/jobs/digest-job.ts` | Modified | Include skipped count |
| `src/email/templates/daily-digest.ts` | Modified | Render skipped section |
| `src/index.ts` | Modified | Wire up new services |

---

## Frontend Tasks (Separate Plan)

The frontend changes are not included in this plan:
- Threshold list page: usage count, inactive badges, banners
- Threshold creation: inline warning for 51+
- Settings page: plan display, usage meter, upgrade CTA
- Banner dismissal logic with localStorage

These should be implemented in a separate frontend-focused plan after backend is complete.
