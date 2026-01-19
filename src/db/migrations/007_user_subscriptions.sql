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
