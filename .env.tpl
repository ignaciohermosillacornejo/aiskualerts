# ===========================================
# 1Password Secret References
# ===========================================
# This file uses 1Password secret references (op://...)
# Secrets are injected at runtime via `op run` command
# NEVER commit actual secrets to this file
#
# Usage:
#   Local Dev:  op run -- bun test:integration
#   Production: op inject -i .env.tpl -o .env (in Docker)
# ===========================================

# Bsale Demo API Configuration
BSALE_ACCESS_TOKEN=op://Dev/BSALE_DEMO_ACCESS_TOKEN/credential
BSALE_API_BASE_URL=https://api.bsale.io

# Bsale OAuth Configuration (for Phase 2)
# BSALE_APP_ID=op://Production/BSALE_APP/app_id
# BSALE_INTEGRATOR_TOKEN=op://Production/BSALE_APP/integrator_token
# BSALE_REDIRECT_URI=https://aiskualerts.com/api/auth/bsale/callback

# Database Configuration
# DATABASE_URL=op://Production/POSTGRES/connection_string

# Test Database (Docker - no secret needed)
TEST_DATABASE_URL=postgres://test:test@localhost:5433/aiskualerts_test

# Email Configuration (Resend)
# RESEND_API_KEY=op://Production/RESEND/api_key

# Session Secret
# SESSION_SECRET=op://Production/SESSION/secret
