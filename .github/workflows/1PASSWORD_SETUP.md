# 1Password Secrets Setup Guide

This document explains how to set up all required secrets in 1Password for the AI SKU Alerts deployment.

## Secret Architecture

All secrets live in **1Password Dev vault only** and are **injected on the server** (not in CI/CD):

```
┌──────────────────────────────────────────────┐
│          1Password Dev Vault                 │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ HETZNER_SSH_KEY        ✅ Exists      │ │
│  │ HETZNER_SERVER_IP      ✅ Exists      │ │
│  │ BSALE_DEMO_ACCESS_TOKEN ✅ Exists     │ │
│  │ POSTGRES               ❌ Need to add │ │
│  │ OP_SERVICE_ACCOUNT     ❌ Need to add │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
          │                        │
          │ (SSH key, server IP)   │ (All secrets via op inject)
          ▼                        │
┌───────────────────────────────┐ │
│  GitHub Actions (CI/CD)       │ │
│  Only needs:                  │ │
│  - OP_SERVICE_ACCOUNT_TOKEN   │ │
│                               │ │
│  1. op read SSH key           │ │
│  2. op read server IP         │ │
│  3. SSH to server             │ │
│  4. Pass OP token to server   │ │
└───────────────────────────────┘ │
          │                        │
          ▼                        │
┌─────────────────────────────┐   │
│  Hetzner Server             │   │
│  46.62.158.249              │   │
│                             │   │
│  op inject runs HERE ◀──────────┘
│  (.env.tpl → .env)          │
│                             │
│  /opt/aiskualerts/          │
│  ├─ .env.tpl (in git)       │
│  └─ .env (chmod 600)        │
│                             │
│  Docker Compose reads .env  │
└─────────────────────────────┘

Secrets never travel over network! ✅
```

## Required Secrets in 1Password

### Dev Vault (All secrets in one place!)

#### HETZNER_SSH_KEY
**Already exists** ✅

- **Type**: Login
- **Fields**:
  - `private key` (password field): SSH private key for server access
  - `public key` (text field): SSH public key
- **Used by**: GitHub Actions to SSH into Hetzner server
- **Reference**: `op://Dev/HETZNER_SSH_KEY/private key`

#### HETZNER_SERVER_IP
**Already exists** ✅

- **Type**: Password/Text
- **Field**: `server` (or whatever field name you used)
- **Value**: `46.62.158.249`
- **Used by**: GitHub Actions to know which server to deploy to
- **Reference**: `op://Dev/HETZNER_SERVER_IP/server`

#### BSALE_DEMO_ACCESS_TOKEN
**Already exists** ✅

- **Type**: Password/Credential
- **Field**: `credential`
- **Value**: Bsale demo API access token
- **Used by**: Application runtime, integration tests
- **Reference**: `op://Dev/BSALE_DEMO_ACCESS_TOKEN/credential`

#### POSTGRES
**Needs to be created** ❌

Create a new item in the Dev vault:

```bash
# Generate a strong password
PASSWORD=$(openssl rand -base64 32)

# Create 1Password item in Dev vault
op item create \
  --category=password \
  --title="POSTGRES" \
  --vault=Dev \
  "password[password]=$PASSWORD"

# Verify it was created
op read "op://Dev/POSTGRES/password"
```

- **Type**: Password
- **Field**: `password`
- **Value**: Strong random password (32+ characters)
- **Used by**: PostgreSQL database
- **Reference in .env.tpl**: `op://Dev/POSTGRES/password`

#### OP_SERVICE_ACCOUNT
**Needs to be created** ❌

This is a 1Password service account token for the **application runtime** (not the same as CI/CD token).

This allows the running application to access additional secrets at runtime if needed (currently optional for Phase 1).

Steps:
1. Go to 1Password → Settings → Developer → Service Accounts
2. Create a new service account named "AI SKU Alerts Runtime"
3. Grant access to **Dev vault** (read-only)
4. Copy the service account token (starts with `ops_`)
5. Store it in 1Password:

```bash
# Store the service account token
op item create \
  --category=password \
  --title="OP_SERVICE_ACCOUNT" \
  --vault=Dev \
  "token[password]=ops_YOUR_TOKEN_HERE"

# Verify
op read "op://Dev/OP_SERVICE_ACCOUNT/token"
```

- **Type**: Password
- **Field**: `token`
- **Value**: 1Password service account token (ops_...)
- **Used by**: App container to access runtime secrets (if needed)
- **Reference in .env.tpl**: `op://Dev/OP_SERVICE_ACCOUNT/token`

## GitHub Secrets (Only 1!)

Only **1 secret** needs to be in GitHub (everything else is in 1Password):

### OP_SERVICE_ACCOUNT_TOKEN
**Needs to be created** ❌

This is a **different** service account from the runtime one. This one is used by GitHub Actions during CI/CD.

Steps:
1. Go to 1Password → Settings → Developer → Service Accounts
2. Create a new service account named "AI SKU Alerts CI/CD"
3. Grant access to **Dev vault** (read-only)
4. Copy the service account token
5. Store in GitHub:

```bash
gh secret set OP_SERVICE_ACCOUNT_TOKEN
# Paste the token when prompted
```

**Used by**: GitHub Actions to run `op inject` and `op read` commands

**That's it!** No other GitHub secrets needed. Server IP, SSH keys, database password - everything comes from 1Password.

## Verification Checklist

Before deploying, verify all secrets are accessible:

### ✅ Check Dev Vault Secrets

```bash
# SSH keys (should already exist)
op read "op://Dev/HETZNER_SSH_KEY/private key" | head -1
op read "op://Dev/HETZNER_SSH_KEY/public key"

# Server IP (should already exist)
op read "op://Dev/HETZNER_SERVER_IP/server"

# Bsale demo token (should already exist)
op read "op://Dev/BSALE_DEMO_ACCESS_TOKEN/credential" | head -10

# PostgreSQL password (needs to be created)
op read "op://Dev/POSTGRES/password"

# Runtime service account token (needs to be created)
op read "op://Dev/OP_SERVICE_ACCOUNT/token" | head -10
```

### ✅ Test op inject

```bash
# Test generating .env file from .env.tpl
op inject -i .env.tpl -o .env.test
cat .env.test
rm .env.test
```

You should see all `op://...` references replaced with actual values.

### ✅ Check GitHub Secrets

```bash
gh secret list
```

Should show:
- `OP_SERVICE_ACCOUNT_TOKEN`

That's it! Just one secret in GitHub.

## Security Best Practices

1. **Never commit .env files** - Always add to `.gitignore`
2. **chmod 600 for .env files** - Protect secrets on disk
3. **Rotate tokens regularly** - Every 90 days minimum
4. **Use least privilege** - Service accounts only access what they need
5. **Monitor access** - Check 1Password audit logs
6. **Clean up temporary files** - Always `rm` .env files after use

## Troubleshooting

### "op: item not found"
- Check vault name is correct (case-sensitive)
- Check item title matches exactly
- Verify you have access to the vault
- Sign in again: `op signin`

### "permission denied" during op inject
- Check service account has read access to the vault
- Verify the service account token is correct
- Test with: `OP_SERVICE_ACCOUNT_TOKEN='your_token' op vault list`

### .env file has op:// references instead of values
- `op inject` wasn't run
- Service account doesn't have access to vault
- Item path is incorrect in .env.tpl

## Quick Setup Commands

Run these to set up everything:

```bash
# 1. Create PostgreSQL password in Dev vault
op item create --category=password --title="POSTGRES" --vault=Dev \
  "password[password]=$(openssl rand -base64 32)"

# 2. Create Runtime service account in 1Password UI
#    Name: "AI SKU Alerts Runtime"
#    Access: Dev vault (read-only)
#    Then store the token:
op item create --category=password --title="OP_SERVICE_ACCOUNT" --vault=Dev \
  "token[password]=YOUR_RUNTIME_SERVICE_ACCOUNT_TOKEN"

# 3. Create CI/CD service account in 1Password UI
#    Name: "AI SKU Alerts CI/CD"
#    Access: Dev vault (read-only)
#    Then set GitHub secret:
gh secret set OP_SERVICE_ACCOUNT_TOKEN
# Paste CI/CD service account token

# 4. Verify everything
op read "op://Dev/HETZNER_SERVER_IP/server"
op read "op://Dev/HETZNER_SSH_KEY/private key" | head -1
op read "op://Dev/POSTGRES/password"
op read "op://Dev/OP_SERVICE_ACCOUNT/token" | head -10
op inject -i .env.tpl -o .env.test && cat .env.test && rm .env.test
gh secret list
```

Done! You're ready to deploy.
