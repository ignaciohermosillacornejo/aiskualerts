-- migrate:up
-- Migration 002: Add digest_frequency column to users table
-- Adds support for configurable email digest frequency

ALTER TABLE users
ADD COLUMN digest_frequency TEXT DEFAULT 'daily'
CHECK (digest_frequency IN ('daily', 'weekly', 'none'));

COMMENT ON COLUMN users.digest_frequency IS 'Email digest frequency: daily, weekly, or none';

-- migrate:down
ALTER TABLE users DROP COLUMN IF EXISTS digest_frequency;
