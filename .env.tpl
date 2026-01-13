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

# Bsale OAuth Configuration (for Phase 3 - Tenant Onboarding)
# Uncomment and add secrets to 1Password when Bsale application is approved:
# BSALE_APP_ID=<add to 1Password: Dev/BSALE_APP_ID>
# BSALE_INTEGRATOR_TOKEN=<add to 1Password: Dev/BSALE_INTEGRATOR_TOKEN>
# BSALE_REDIRECT_URI=https://aiskualerts.com/api/auth/bsale/callback
# BSALE_OAUTH_BASE_URL=https://oauth.bsale.io

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
# Test Database (Local Development Only)
# ===========================================
TEST_DATABASE_URL=postgres://test:test@localhost:5433/aiskualerts_test
