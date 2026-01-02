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
# Bsale API Configuration
# ===========================================
BSALE_ACCESS_TOKEN=op://Dev/BSALE_DEMO_ACCESS_TOKEN/credential
BSALE_API_BASE_URL=https://api.bsale.io

# Bsale OAuth Configuration (for Phase 2)
# BSALE_APP_ID=<will be added in Phase 2>
# BSALE_INTEGRATOR_TOKEN=<will be added in Phase 2>
# BSALE_REDIRECT_URI=https://aiskualerts.com/api/auth/bsale/callback

# ===========================================
# Email Configuration (Resend - for Phase 3)
# ===========================================
# RESEND_API_KEY=<will be added in Phase 3>

# ===========================================
# Session Secret (for Phase 2)
# ===========================================
# SESSION_SECRET=<will be added in Phase 2>

# ===========================================
# Test Database (Local Development Only)
# ===========================================
TEST_DATABASE_URL=postgres://test:test@localhost:5433/aiskualerts_test
