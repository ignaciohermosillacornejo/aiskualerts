-- migrate:up
-- Migration 004: Stripe to MercadoPago billing
-- Replaces Stripe-specific columns with provider-agnostic subscription columns

-- Step 1: Drop Stripe-specific column and index
DROP INDEX IF EXISTS idx_tenants_stripe_customer;
ALTER TABLE tenants DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS is_paid;

-- Step 2: Add provider-agnostic subscription columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_id TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Step 3: Create index for subscription lookups
CREATE INDEX IF NOT EXISTS idx_tenants_subscription ON tenants(subscription_id) WHERE subscription_id IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_tenants_subscription;
ALTER TABLE tenants DROP COLUMN IF EXISTS subscription_ends_at;
ALTER TABLE tenants DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE tenants DROP COLUMN IF EXISTS subscription_id;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
