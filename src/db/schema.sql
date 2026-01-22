-- ===========================================
-- TENANTS (Bsale accounts)
-- ===========================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bsale_client_code TEXT UNIQUE,            -- RUT (Chile), RUC (Peru), RFC (Mexico) - NULL if not connected
    bsale_client_name TEXT,                   -- NULL if not connected to Bsale
    bsale_access_token TEXT,                  -- Encrypted at rest - NULL if not connected
    sync_status TEXT DEFAULT 'not_connected', -- not_connected | pending | syncing | success | failed
    last_sync_at TIMESTAMPTZ,
    -- Billing (provider-agnostic)
    subscription_id TEXT UNIQUE,
    subscription_status TEXT DEFAULT 'none',
    subscription_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- USERS (belong to a tenant)
-- ===========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    notification_enabled BOOLEAN DEFAULT true,
    notification_email TEXT,                  -- Override email for notifications
    digest_frequency TEXT DEFAULT 'daily' CHECK (digest_frequency IN ('daily', 'weekly', 'none')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- ===========================================
-- STOCK SNAPSHOTS (daily sync from Bsale)
-- ===========================================
CREATE TABLE stock_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bsale_variant_id INTEGER NOT NULL,
    bsale_office_id INTEGER,                  -- NULL if single location
    sku TEXT,
    barcode TEXT,
    product_name TEXT,
    quantity INTEGER NOT NULL,                -- Physical quantity
    quantity_reserved INTEGER DEFAULT 0,      -- Reserved in pending docs
    quantity_available INTEGER NOT NULL,      -- Available for sale
    unit_price DECIMAL(12, 2) DEFAULT NULL,   -- Price from Bsale (migration 006)
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, bsale_variant_id, bsale_office_id, snapshot_date)
);

-- ===========================================
-- DAILY CONSUMPTION (velocity tracking)
-- ===========================================
CREATE TABLE daily_consumption (
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

-- ===========================================
-- THRESHOLDS (user-defined alert triggers)
-- ===========================================
CREATE TABLE thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bsale_variant_id INTEGER,                 -- NULL = default for all SKUs
    bsale_office_id INTEGER,                  -- NULL = all locations
    threshold_type TEXT NOT NULL DEFAULT 'quantity' CHECK (threshold_type IN ('quantity', 'days')),
    min_quantity INTEGER,                     -- Alert when stock <= this (for quantity-based)
    min_days INTEGER,                         -- Alert when days of stock <= this (for days-based)
    days_warning INTEGER DEFAULT 7,           -- Alert when days-to-stockout <= this
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, bsale_variant_id, bsale_office_id),
    CONSTRAINT check_threshold_type_fields CHECK (
        (threshold_type = 'quantity' AND min_quantity IS NOT NULL) OR
        (threshold_type = 'days' AND min_days IS NOT NULL)
    )
);

-- ===========================================
-- ALERTS (generated alerts awaiting/sent)
-- ===========================================
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bsale_variant_id INTEGER NOT NULL,
    bsale_office_id INTEGER,
    sku TEXT,
    product_name TEXT,
    alert_type TEXT NOT NULL,                 -- 'threshold_breach' | 'low_velocity'
    current_quantity INTEGER NOT NULL,
    threshold_quantity INTEGER,               -- For threshold_breach type
    days_to_stockout INTEGER,                 -- For low_velocity type
    status TEXT DEFAULT 'pending',            -- pending | sent | dismissed
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SESSIONS (cookie-based auth)
-- ===========================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- MAGIC LINK TOKENS (passwordless auth)
-- ===========================================
CREATE TABLE magic_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX idx_snapshots_tenant_date ON stock_snapshots(tenant_id, snapshot_date DESC);
CREATE INDEX idx_snapshots_variant ON stock_snapshots(tenant_id, bsale_variant_id, snapshot_date DESC);
CREATE INDEX idx_consumption_tenant_variant_date ON daily_consumption(tenant_id, bsale_variant_id, consumption_date DESC);
CREATE INDEX idx_consumption_date_range ON daily_consumption(tenant_id, consumption_date DESC);
CREATE INDEX idx_thresholds_user ON thresholds(user_id);
CREATE INDEX idx_thresholds_tenant_variant ON thresholds(tenant_id, bsale_variant_id);
CREATE INDEX idx_alerts_user_status ON alerts(user_id, status);
CREATE INDEX idx_alerts_tenant_date ON alerts(tenant_id, created_at DESC);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_tenants_subscription ON tenants(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_magic_link_tokens_token ON magic_link_tokens(token) WHERE used_at IS NULL;
CREATE INDEX idx_magic_link_tokens_email_created ON magic_link_tokens(email, created_at DESC);

-- ===========================================
-- MIGRATION TRACKING
-- ===========================================
-- This table tracks which migrations have been applied.
-- Schema.sql includes all changes from migrations 1-10.
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mark migrations 1-10 as already applied (since schema.sql includes their changes)
INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4), (5), (6), (7), (8), (9), (10);
