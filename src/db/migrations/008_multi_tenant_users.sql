-- 008_multi_tenant_users.sql
-- Multi-tenant users: Allow users to belong to multiple tenants

-- 1. Create user_tenants junction table
CREATE TABLE IF NOT EXISTS user_tenants (
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

CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- 2. Add owner_id to tenants (will be populated from existing data)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_id UUID;

-- 3. Add last_tenant_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_tenant_id UUID;

-- 4. Add current_tenant_id to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_tenant_id UUID;

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
WHERE tenant_id IS NOT NULL
ON CONFLICT (user_id, tenant_id) DO NOTHING;

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
UPDATE users SET last_tenant_id = tenant_id WHERE tenant_id IS NOT NULL AND last_tenant_id IS NULL;

-- 8. Set current_tenant_id on sessions from user's tenant_id
UPDATE sessions s
SET current_tenant_id = u.tenant_id
FROM users u
WHERE s.user_id = u.id AND u.tenant_id IS NOT NULL AND s.current_tenant_id IS NULL;

-- 9. Modify thresholds: add created_by column
ALTER TABLE thresholds ADD COLUMN IF NOT EXISTS created_by UUID;
UPDATE thresholds SET created_by = user_id WHERE created_by IS NULL;

-- 10. Modify alerts: add dismissed_by column
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dismissed_by UUID;
UPDATE alerts SET dismissed_by = user_id WHERE status = 'dismissed' AND dismissed_by IS NULL;

-- 11. Add foreign key constraints (idempotent)
DO $$
BEGIN
  -- user_tenants -> users
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_tenants_user') THEN
    ALTER TABLE user_tenants ADD CONSTRAINT fk_user_tenants_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- user_tenants -> tenants
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_tenants_tenant') THEN
    ALTER TABLE user_tenants ADD CONSTRAINT fk_user_tenants_tenant
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  -- tenants -> users (owner)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tenants_owner') THEN
    ALTER TABLE tenants ADD CONSTRAINT fk_tenants_owner
      FOREIGN KEY (owner_id) REFERENCES users(id);
  END IF;

  -- users -> tenants (last_tenant)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_last_tenant') THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_last_tenant
      FOREIGN KEY (last_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;

  -- sessions -> tenants (current_tenant)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_current_tenant') THEN
    ALTER TABLE sessions ADD CONSTRAINT fk_sessions_current_tenant
      FOREIGN KEY (current_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;

  -- thresholds -> users (created_by)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_thresholds_created_by') THEN
    ALTER TABLE thresholds ADD CONSTRAINT fk_thresholds_created_by
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- alerts -> users (dismissed_by)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alerts_dismissed_by') THEN
    ALTER TABLE alerts ADD CONSTRAINT fk_alerts_dismissed_by
      FOREIGN KEY (dismissed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Note: We're keeping tenant_id, notification columns on users, and user_id on thresholds/alerts
-- for backwards compatibility during the transition. They will be removed in a future migration
-- after the codebase is fully updated to use the new schema.
