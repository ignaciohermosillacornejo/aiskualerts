-- Migration 005: Magic link authentication support
-- Separates user authentication from Bsale integration

-- 1. Make bsale_client_code nullable (allows tenants without Bsale connection)
ALTER TABLE tenants ALTER COLUMN bsale_client_code DROP NOT NULL;

-- 2. Make bsale_access_token nullable (allows tenants without Bsale connection)
ALTER TABLE tenants ALTER COLUMN bsale_access_token DROP NOT NULL;

-- 3. Add 'not_connected' to sync_status for tenants without Bsale
-- Note: PostgreSQL allows multiple NULLs in UNIQUE columns by default
-- No constraint change needed as sync_status uses TEXT without enum constraint

-- 4. Create magic_link_tokens table for passwordless authentication
CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient token lookup and rate limiting
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_token ON magic_link_tokens(token) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email_created ON magic_link_tokens(email, created_at DESC);
