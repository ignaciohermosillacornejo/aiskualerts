-- Migration 002: Add digest_frequency column to users table
-- This migration adds support for configurable email digest frequency

ALTER TABLE users
ADD COLUMN digest_frequency TEXT DEFAULT 'daily'
CHECK (digest_frequency IN ('daily', 'weekly', 'none'));

-- Add comment for documentation
COMMENT ON COLUMN users.digest_frequency IS 'Email digest frequency: daily, weekly, or none';
