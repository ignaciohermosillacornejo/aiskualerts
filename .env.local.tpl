# Local Development Environment Template
# Uses test database and test MercadoPago credentials
# Run with: op run --env-file=.env.local.tpl -- bun run dev

# ===========================================
# Database Configuration (LOCAL TEST)
# ===========================================
DATABASE_URL=postgres://test:test@localhost:5433/aiskualerts_test

# ===========================================
# Application Configuration
# ===========================================
NODE_ENV=development
PORT=3000

# ===========================================
# CORS Configuration
# ===========================================
ALLOWED_ORIGINS=http://localhost:3000

# ===========================================
# Bsale API Configuration
# ===========================================
BSALE_API_BASE_URL=https://api.bsale.io

# Bsale OAuth Configuration
BSALE_APP_ID=op://Dev/BSALE_APP_ID/credential
BSALE_INTEGRATOR_TOKEN=op://Dev/BSALE_INTEGRATOR_TOKEN/credential
# Note: Will be updated once ngrok is started
BSALE_REDIRECT_URI=http://localhost:3000/api/bsale/callback
BSALE_OAUTH_BASE_URL=https://oauth.bsale.io

# ===========================================
# Email Configuration (Resend)
# ===========================================
RESEND_API_KEY=op://Dev/RESEND_API_KEY/credential

# ===========================================
# Security Configuration
# ===========================================
TOKEN_ENCRYPTION_KEY=op://Dev/TOKEN_ENCRYPTION_KEY/credential
CSRF_TOKEN_SECRET=op://Dev/CSRF_TOKEN_SECRET/credential

# ===========================================
# MercadoPago Billing Configuration (TEST)
# ===========================================
# Using test seller credentials for sandbox testing
MERCADOPAGO_ACCESS_TOKEN=op://Dev/MP_TEST_SELLER_ACCESS_TOKEN/credential
MERCADOPAGO_WEBHOOK_SECRET=op://Dev/MP_TEST_WEBHOOK_SECRET/credential
MERCADOPAGO_PLAN_AMOUNT=9990
MERCADOPAGO_PLAN_CURRENCY=CLP

# App URL - will be updated with ngrok URL
APP_URL=http://localhost:3000

# ===========================================
# Sync Configuration (Disabled for testing)
# ===========================================
SYNC_ENABLED=false
DIGEST_ENABLED=false
