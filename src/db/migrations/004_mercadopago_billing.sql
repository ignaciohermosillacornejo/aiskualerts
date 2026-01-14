-- Migration: Stripe to MercadoPago billing
-- Replaces Stripe-specific columns with provider-agnostic subscription columns

-- Step 1: Drop Stripe-specific column and index
DROP INDEX IF EXISTS idx_tenants_stripe_customer;
ALTER TABLE tenants DROP COLUMN IF EXISTS stripe_customer_id;

-- Step 2: Add provider-agnostic subscription columns (if they don't exist)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_id TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Step 3: Create index for subscription lookups
CREATE INDEX IF NOT EXISTS idx_tenants_subscription ON tenants(subscription_id) WHERE subscription_id IS NOT NULL;

-- Note: This migration is idempotent - safe to run multiple times
