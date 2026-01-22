-- migrate:up
-- Migration 007: Move subscription tracking from tenant to user level

-- Add subscription columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Add constraint for subscription_status (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_subscription_status_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
      CHECK (subscription_status IN ('none', 'active', 'cancelled', 'past_due'));
  END IF;
END $$;

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

-- migrate:down
DROP INDEX IF EXISTS idx_users_subscription;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_status_check;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_ends_at;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_id;
