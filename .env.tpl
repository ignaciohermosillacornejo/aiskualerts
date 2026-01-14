# ===========================================
# 1Password Secret References
# ===========================================
# This file uses 1Password secret references
# Secrets are injected at runtime via `op inject` command
# NEVER commit actual secrets to this file
#
# ALL SECRETS LIVE IN DEV VAULT (single environment approach)
#
# Usage:
#   Local Dev:        op run --env-file=.env.tpl -- bun test:integration
#   CI/CD Deployment: op inject -i .env.tpl -o .env (in GitHub Actions)
#   Production:       All secrets injected via .env file (chmod 600)
# ===========================================

# ===========================================
# Database Configuration
# ===========================================
POSTGRES_USER=aiskualerts
POSTGRES_PASSWORD=op://Dev/POSTGRES/password
POSTGRES_DB=aiskualerts

# Internal Docker network URL for app container to connect to postgres container
DATABASE_URL=postgresql://aiskualerts:op://Dev/POSTGRES/password@postgres:5432/aiskualerts

# ===========================================
# 1Password Service Account (Runtime)
# ===========================================
# NOT NEEDED FOR PHASE 1 - App doesn't use 1Password CLI at runtime yet
# This will be added in future phases when app needs dynamic secret access

# ===========================================
# Application Configuration
# ===========================================
NODE_ENV=production
PORT=3000

# ===========================================
# CORS Configuration
# ===========================================
# Comma-separated list of allowed origins for CORS requests
# REQUIRED in production - server will fail to start without this
# For production, set to your frontend domain(s)
ALLOWED_ORIGINS=https://aiskualerts.com

# ===========================================
# Bsale API Configuration
# ===========================================
BSALE_ACCESS_TOKEN=op://Dev/BSALE_DEMO_ACCESS_TOKEN/credential
BSALE_API_BASE_URL=https://api.bsale.io

# Bsale OAuth Configuration (Production - Approved)
BSALE_APP_ID=op://Dev/BSALE_APP_ID/credential
BSALE_APP_TOKEN=op://Dev/BSALE_APP_TOKEN/credential
BSALE_REDIRECT_URI=https://aiskualerts.com/api/auth/bsale/callback
BSALE_OAUTH_BASE_URL=https://oauth.bsale.io

# ===========================================
# Email Configuration (Resend - for Phase 3)
# ===========================================
# RESEND_API_KEY=<will be added in Phase 3>

# ===========================================
# Sync Configuration
# ===========================================
SYNC_ENABLED=true
SYNC_HOUR=2
SYNC_MINUTE=0
SYNC_BATCH_SIZE=100
SYNC_TENANT_DELAY_MS=5000

# ===========================================
# Security Configuration
# ===========================================
# Token encryption key for encrypting access tokens at rest (min 32 characters)
# Generate with: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=op://Dev/TOKEN_ENCRYPTION_KEY/credential

# CSRF token secret for CSRF protection (min 32 characters)
# Generate with: openssl rand -base64 32
CSRF_TOKEN_SECRET=op://Dev/CSRF_TOKEN_SECRET/credential

# ===========================================
# MercadoPago Billing Configuration
# ===========================================
# Access token from MercadoPago dashboard (Credenciales > Access Token)
MERCADOPAGO_ACCESS_TOKEN=op://Dev/MERCADOPAGO_ACCESS_TOKEN/credential

# Public key (for frontend SDK if needed)
MERCADOPAGO_PUBLIC_KEY=op://Dev/MERCADOPAGO_PUBLIC_KEY/credential

# OAuth credentials (for marketplace integrations if needed)
MERCADOPAGO_CLIENT_ID=op://Dev/MERCADOPAGO_CLIENT_ID/credential
MERCADOPAGO_CLIENT_SECRET=op://Dev/MERCADOPAGO_CLIENT_SECRET/credential

# Webhook secret for validating webhook signatures
MERCADOPAGO_WEBHOOK_SECRET=op://Dev/MERCADOPAGO_WEBHOOK_SECRET/credential

# Subscription plan amount in minor units (e.g., 9990 = $99.90 CLP)
MERCADOPAGO_PLAN_AMOUNT=9990

# Currency code (3 characters): CLP, ARS, BRL, MXN, etc.
MERCADOPAGO_PLAN_CURRENCY=CLP

# Application URL for callbacks (must be publicly accessible for webhooks)
APP_URL=https://aiskualerts.com

# ===========================================
# Test Database (Local Development Only)
# ===========================================
TEST_DATABASE_URL=postgres://test:test@localhost:5433/aiskualerts_test
