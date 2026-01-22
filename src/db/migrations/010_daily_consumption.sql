-- 010_daily_consumption.sql
-- Track daily sales/consumption per variant for velocity calculations

CREATE TABLE IF NOT EXISTS daily_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bsale_variant_id INTEGER NOT NULL,
  bsale_office_id INTEGER,
  consumption_date DATE NOT NULL,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  document_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (tenant_id, bsale_variant_id, bsale_office_id, consumption_date)
);

CREATE INDEX IF NOT EXISTS idx_consumption_tenant_variant_date
ON daily_consumption (tenant_id, bsale_variant_id, consumption_date DESC);

CREATE INDEX IF NOT EXISTS idx_consumption_date_range
ON daily_consumption (tenant_id, consumption_date DESC);

COMMENT ON TABLE daily_consumption IS 'Daily sales quantities per variant, aggregated from Bsale documents';
