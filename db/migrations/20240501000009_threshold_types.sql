-- migrate:up
-- Migration 009: Add threshold type support
-- Support for quantity-based or days-based thresholds

-- Add threshold_type column with default 'quantity' for existing rows
ALTER TABLE thresholds
ADD COLUMN IF NOT EXISTS threshold_type TEXT NOT NULL DEFAULT 'quantity';

-- Add constraint to ensure threshold_type is valid
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'thresholds_threshold_type_check') THEN
    ALTER TABLE thresholds ADD CONSTRAINT thresholds_threshold_type_check
      CHECK (threshold_type IN ('quantity', 'days'));
  END IF;
END $$;

-- Add min_days column for days-based thresholds
ALTER TABLE thresholds
ADD COLUMN IF NOT EXISTS min_days INTEGER;

-- Make min_quantity nullable (required for days-based thresholds that don't need min_quantity)
ALTER TABLE thresholds ALTER COLUMN min_quantity DROP NOT NULL;

-- Add constraint: ensure correct fields are set based on threshold_type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_threshold_type_fields') THEN
    ALTER TABLE thresholds ADD CONSTRAINT check_threshold_type_fields CHECK (
      (threshold_type = 'quantity' AND min_quantity IS NOT NULL) OR
      (threshold_type = 'days' AND min_days IS NOT NULL)
    );
  END IF;
END $$;

COMMENT ON COLUMN thresholds.threshold_type IS 'Type of threshold: quantity (min units) or days (min days of stock)';
COMMENT ON COLUMN thresholds.min_days IS 'Minimum days of stock remaining before alert (for days-based thresholds)';

-- migrate:down
ALTER TABLE thresholds DROP CONSTRAINT IF EXISTS check_threshold_type_fields;
ALTER TABLE thresholds ALTER COLUMN min_quantity SET NOT NULL;
ALTER TABLE thresholds DROP COLUMN IF EXISTS min_days;
ALTER TABLE thresholds DROP CONSTRAINT IF EXISTS thresholds_threshold_type_check;
ALTER TABLE thresholds DROP COLUMN IF EXISTS threshold_type;
