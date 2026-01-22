-- 009_threshold_types.sql
-- Add threshold type support: quantity-based or days-based

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
-- quantity-based thresholds must have min_quantity, days-based must have min_days
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_threshold_type_fields') THEN
    ALTER TABLE thresholds ADD CONSTRAINT check_threshold_type_fields CHECK (
      (threshold_type = 'quantity' AND min_quantity IS NOT NULL) OR
      (threshold_type = 'days' AND min_days IS NOT NULL)
    );
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN thresholds.threshold_type IS 'Type of threshold: quantity (min units) or days (min days of stock)';
COMMENT ON COLUMN thresholds.min_days IS 'Minimum days of stock remaining before alert (for days-based thresholds)';
