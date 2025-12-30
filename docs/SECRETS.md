# Secrets Management with 1Password

## Overview

This project uses **1Password CLI** for secure secret management. Secrets are **never stored on disk** in plaintext.

### Architecture

```
┌─────────────────────────────────────────────────┐
│ Local Development                               │
├─────────────────────────────────────────────────┤
│ .env.tpl (tracked in git)                       │
│   ├─ Contains 1Password references              │
│   └─ Example: op://Dev/BSALE_DEMO/credential    │
│                                                  │
│ op run --env-file=.env.tpl -- <command>         │
│   ├─ Reads .env.tpl                             │
│   ├─ Fetches secrets from 1Password             │
│   ├─ Injects into environment at runtime        │
│   └─ Runs command with secrets in memory        │
│                                                  │
│ ✅ No secrets on disk                           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Production (Docker)                              │
├─────────────────────────────────────────────────┤
│ .env.tpl (baked into image)                     │
│                                                  │
│ Docker entrypoint:                               │
│   op inject -i .env.tpl -o .env                 │
│   ├─ Reads .env.tpl                             │
│   ├─ Fetches secrets from 1Password             │
│   └─ Writes .env file (ephemeral container)     │
│                                                  │
│ Application reads .env                           │
│                                                  │
│ ✅ Secrets injected at container startup        │
└─────────────────────────────────────────────────┘
```

## Prerequisites

### 1. Install 1Password CLI

```bash
# macOS
brew install 1password-cli

# Verify installation
op --version
```

### 2. Sign in to 1Password

```bash
# Sign in (one-time setup)
op account add

# Enable biometric unlock (recommended)
op signin

# Verify access
op vault list
```

## Local Development Setup

### No Setup Required! 🎉

Secrets are automatically loaded from 1Password when you run integration tests.

### Current Secrets in 1Password

| Secret | 1Password Reference | Purpose |
|--------|-------------------|---------|
| Bsale Demo Token | `op://Dev/BSALE_DEMO_ACCESS_TOKEN/credential` | E2E integration tests |

### Adding New Secrets

1. **Store in 1Password:**
   ```bash
   # Using CLI
   op item create --category=login \
     --title="NEW_SECRET_NAME" \
     --vault=Dev \
     credential=your-secret-value

   # Or use 1Password app (easier)
   ```

2. **Add reference to `.env.tpl`:**
   ```bash
   NEW_SECRET=op://Dev/NEW_SECRET_NAME/credential
   ```

3. **Commit `.env.tpl`:**
   ```bash
   git add .env.tpl
   git commit -m "Add NEW_SECRET to config"
   ```

## Running Tests with Secrets

### Integration/E2E Tests (require secrets)

```bash
# Automatic 1Password injection
bun run test:integration
bun run test:e2e

# What happens:
# 1. op run reads .env.tpl
# 2. Fetches BSALE_ACCESS_TOKEN from 1Password
# 3. Injects into environment
# 4. Runs test suite
# 5. Secrets cleared from memory when done
```

### Unit Tests (no secrets needed)

```bash
# No 1Password required
bun test
bun run test:unit
```

## Manual Secret Injection

### Run any command with secrets

```bash
# Pattern
op run --env-file=.env.tpl -- <your-command>

# Examples
op run --env-file=.env.tpl -- bun index.ts
op run --env-file=.env.tpl -- curl -H "access_token: $BSALE_ACCESS_TOKEN" https://api.bsale.io/v1/stocks.json
op run --env-file=.env.tpl -- env | grep BSALE
```

### Temporary .env file (not recommended)

```bash
# Generate .env for debugging only
op inject -i .env.tpl -o .env

# ⚠️ WARNING: This creates a plaintext file with secrets!
# Delete it immediately after use:
rm .env
```

## Production (Docker)

### Dockerfile Pattern

```dockerfile
FROM oven/bun:latest

WORKDIR /app

# Install 1Password CLI
RUN curl -sSfo op.zip https://cache.agilebits.com/dist/1P/op2/pkg/v2.18.0/op_linux_amd64_v2.18.0.zip \
    && unzip -od /usr/local/bin/ op.zip \
    && rm op.zip

# Copy .env.tpl (contains secret references)
COPY .env.tpl .

# Inject secrets at runtime
CMD ["sh", "-c", "op inject -i .env.tpl -o .env && bun run start"]
```

### Docker Compose

```yaml
services:
  app:
    build: .
    environment:
      # 1Password service account token (injected by CI/CD)
      - OP_SERVICE_ACCOUNT_TOKEN=${OP_SERVICE_ACCOUNT_TOKEN}
    volumes:
      - ./.env.tpl:/app/.env.tpl:ro
```

### GitHub Actions (Future)

```yaml
- name: Run integration tests
  env:
    OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
  run: |
    op run --env-file=.env.tpl -- bun run test:integration
```

## File Reference

### `.env.tpl` (tracked in git)

```bash
# Contains 1Password secret references
# Safe to commit
BSALE_ACCESS_TOKEN=op://Dev/BSALE_DEMO_ACCESS_TOKEN/credential
```

**✅ Committed to git**
**✅ No actual secrets**
**✅ Team-wide configuration**

### `.env` (ignored by git)

```bash
# Generated by op inject (Docker only)
# Contains actual secrets
BSALE_ACCESS_TOKEN=98f5d867d5b72420816c9827c6158a08278759c6
```

**❌ Never commit**
**❌ Only exists in Docker containers**
**❌ Ephemeral (recreated on each deploy)**

### `.env.example` (tracked in git)

```bash
# Documentation/reference only
# Shows what secrets are needed
BSALE_ACCESS_TOKEN=your-access-token-here
```

**✅ Committed to git**
**✅ Documentation only**
**❌ Not used at runtime**

## Security Benefits

### Local Development

✅ **Zero secrets on disk** - Fetched from 1Password at runtime
✅ **Biometric unlock** - Touch ID/Face ID for access
✅ **Automatic expiry** - Secrets cleared when process exits
✅ **Audit trail** - 1Password logs all access
✅ **Team access control** - Manage who sees what secrets

### Production

✅ **Secrets in memory only** - Never written to persistent storage
✅ **Service account** - Machine-to-machine authentication
✅ **Rotation ready** - Update in 1Password, redeploy
✅ **No .env files in images** - Docker images contain only references
✅ **Ephemeral containers** - Secrets die with the container

## Troubleshooting

### "op: command not found"

```bash
# Install 1Password CLI
brew install 1password-cli
```

### "authentication required"

```bash
# Sign in to 1Password
op signin
```

### "secret not found"

```bash
# Verify secret exists
op item get "BSALE_DEMO_ACCESS_TOKEN" --vault Dev

# Check the reference path matches
cat .env.tpl
```

### "biometric unlock failed"

```bash
# Fall back to password
op signin --account your-account.1password.com
```

### Integration tests fail with "BSALE_ACCESS_TOKEN must be set"

```bash
# Ensure you're using the correct command
bun run test:integration  # ✅ Uses op run
bun test tests/**/*.integration.test.ts  # ❌ No op run
```

## Best Practices

### DO ✅

- Use `bun run test:integration` (includes `op run` automatically)
- Store all secrets in 1Password, even for development
- Commit `.env.tpl` with secret references
- Update `.env.tpl` when adding new secrets
- Use descriptive secret names in 1Password

### DON'T ❌

- Create `.env` files manually (let `op inject` handle it in Docker)
- Commit actual secrets anywhere
- Share secrets via Slack/email
- Hard-code secrets in source code
- Store secrets in environment variables in CI (use service accounts)

## Migration from .env to 1Password

If you have existing `.env` files:

1. **Store each secret in 1Password:**
   ```bash
   # Interactive
   op item create --category=login --title="SECRET_NAME" --vault=Dev

   # Or via 1Password app
   ```

2. **Replace values with references in `.env.tpl`:**
   ```bash
   # Before
   SECRET_KEY=actual-secret-value

   # After
   SECRET_KEY=op://Dev/SECRET_NAME/credential
   ```

3. **Delete the `.env` file:**
   ```bash
   rm .env
   ```

4. **Test:**
   ```bash
   op run --env-file=.env.tpl -- env | grep SECRET_KEY
   ```

## References

- [1Password CLI Documentation](https://developer.1password.com/docs/cli/)
- [Secret References](https://developer.1password.com/docs/cli/secrets-config-files/)
- [op run command](https://developer.1password.com/docs/cli/reference/commands/run)
- [op inject command](https://developer.1password.com/docs/cli/reference/commands/inject)
- [Service Accounts](https://developer.1password.com/docs/service-accounts/)

---

**Status:** ✅ Active
**Local Setup:** Zero-config (uses `op run` automatically)
**Production:** Inject secrets at container startup via `op inject`
