-- migrate:up
-- Migration 006: Add price column to stock_snapshots

ALTER TABLE stock_snapshots
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12, 2) DEFAULT NULL;

-- migrate:down
ALTER TABLE stock_snapshots DROP COLUMN IF EXISTS unit_price;
