-- src/db/migrations/011_alert_lifecycle.sql
-- Enhanced alert lifecycle: track dismissal time and enable reset detection

-- Add dismissed_at column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'alerts' AND column_name = 'dismissed_at') THEN
        ALTER TABLE alerts ADD COLUMN dismissed_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add last_notified_at column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'alerts' AND column_name = 'last_notified_at') THEN
        ALTER TABLE alerts ADD COLUMN last_notified_at TIMESTAMPTZ;
    END IF;
END $$;

-- Index for finding dismissed alerts that may need reset
CREATE INDEX IF NOT EXISTS idx_alerts_dismissed
ON alerts (tenant_id, bsale_variant_id, status)
WHERE status = 'dismissed';

COMMENT ON COLUMN alerts.dismissed_at IS 'When user dismissed this alert (took action)';
COMMENT ON COLUMN alerts.last_notified_at IS 'Last time user was emailed about this alert';

-- Track this migration
INSERT INTO schema_migrations (version) VALUES (11) ON CONFLICT DO NOTHING;
