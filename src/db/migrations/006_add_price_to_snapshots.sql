-- Add price column to stock_snapshots
ALTER TABLE stock_snapshots
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12, 2) DEFAULT NULL;
