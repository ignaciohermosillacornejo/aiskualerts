# GitHub Secrets Setup Guide

This guide helps you set up the required GitHub secrets for deployment.

## Required Secrets

### 1. OP_SERVICE_ACCOUNT_TOKEN
**Purpose**: 1Password service account for CI/CD pipeline to access SSH keys

**How to create**:
```bash
# Create a service account in 1Password with access to Dev vault
# Copy the token and run:
gh secret set OP_SERVICE_ACCOUNT_TOKEN
# Paste the token when prompted
```

Or via web:
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `OP_SERVICE_ACCOUNT_TOKEN`
4. Value: Your 1Password service account token

### 2. OP_PROD_SERVICE_ACCOUNT_TOKEN
**Purpose**: 1Password service account for production runtime secret injection (Bsale API, etc.)

**How to create**:
```bash
# Create a service account in 1Password with access to Production vault
gh secret set OP_PROD_SERVICE_ACCOUNT_TOKEN
# Paste the token when prompted
```

### 3. HETZNER_SERVER_IP
**Purpose**: IP address of your Hetzner Cloud server

**How to set**:
```bash
gh secret set HETZNER_SERVER_IP
# Enter your server IP (e.g., 195.201.123.45)
```

Or get it from Hetzner:
```bash
# If using Hetzner CLI
hcloud server list

# Copy the IP and set it
gh secret set HETZNER_SERVER_IP
```

### 4. POSTGRES_PASSWORD
**Purpose**: PostgreSQL database password for production

**How to create**:
```bash
# Generate a strong password
openssl rand -base64 32

# Set it as a secret
gh secret set POSTGRES_PASSWORD
# Paste the generated password
```

## Quick Setup Script

Run this script to set all secrets at once:

```bash
#!/bin/bash
set -euo pipefail

echo "Setting up GitHub secrets for deployment..."
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Please authenticate with GitHub first:"
    gh auth login
fi

echo "1/4: Setting OP_SERVICE_ACCOUNT_TOKEN (CI/CD 1Password token)..."
gh secret set OP_SERVICE_ACCOUNT_TOKEN

echo "2/4: Setting OP_PROD_SERVICE_ACCOUNT_TOKEN (Production 1Password token)..."
gh secret set OP_PROD_SERVICE_ACCOUNT_TOKEN

echo "3/4: Setting HETZNER_SERVER_IP (Server IP address)..."
gh secret set HETZNER_SERVER_IP

echo "4/4: Setting POSTGRES_PASSWORD (Database password)..."
gh secret set POSTGRES_PASSWORD

echo ""
echo "✅ All secrets set successfully!"
echo ""
echo "Verify secrets:"
gh secret list
```

## Verification

Check that all secrets are set:

```bash
gh secret list
```

You should see:
- OP_SERVICE_ACCOUNT_TOKEN
- OP_PROD_SERVICE_ACCOUNT_TOKEN
- HETZNER_SERVER_IP
- POSTGRES_PASSWORD

## Security Notes

1. **Never commit secrets** to git
2. **Rotate tokens** regularly (every 90 days)
3. **Use least privilege** - 1Password service accounts should only have access to required vaults
4. **Monitor usage** - Check 1Password audit logs for service account activity
5. **Backup secrets** - Store a copy in your password manager

## Troubleshooting

### Secret not accessible in workflow
- Check secret name matches exactly (case-sensitive)
- Verify workflow has correct environment configured
- Check repository settings → Actions → General → Workflow permissions

### 1Password authentication fails
- Verify service account token is valid
- Check service account has access to required vaults/items
- Test locally: `OP_SERVICE_ACCOUNT_TOKEN='your_token' op vault list`

### SSH connection fails
- Verify HETZNER_SERVER_IP is correct
- Check SSH key is in 1Password at `op://Dev/HETZNER_SSH_KEY/private key`
- Verify public key is in server's `~/.ssh/authorized_keys`
