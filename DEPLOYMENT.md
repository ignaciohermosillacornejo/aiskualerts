# Deployment Guide - Hetzner Cloud

This guide covers deploying AI SKU Alerts to Hetzner Cloud using GitHub Actions.

## Deployment Architecture

**Simple rsync + Docker Compose deployment**

1. **GitHub Actions** runs `op inject` to generate `.env` from `.env.tpl`
2. **rsync** syncs files to server (including `.env`)
3. **Docker Compose** starts the application

Key principles:
- `.env.tpl` is in git with `op://Dev/...` references (safe - no actual secrets)
- Secrets are resolved in GitHub Actions using `op inject`
- `.env` file is synced to server via rsync with `chmod 600`
- Docker Compose reads secrets from `.env` file
- Deployment **fails loudly** if any `op://...` reference cannot be resolved

See [1PASSWORD_SETUP.md](.github/workflows/1PASSWORD_SETUP.md) for secret configuration.

## Prerequisites

1. **Hetzner Cloud Server**
   - Ubuntu 22.04 or later
   - Minimum 2GB RAM (4GB recommended)
   - SSH access with root user
   - Public IP address
   - **Current Server**: `46.62.158.249` (ubuntu-8gb-hel1-1)

2. **1Password Setup** (See [1PASSWORD_SETUP.md](.github/workflows/1PASSWORD_SETUP.md))
   - **Dev Vault** (all secrets in one place!):
     - `HETZNER_SSH_KEY` ✅ Already exists
     - `HETZNER_SERVER_IP` ✅ Already exists
     - `BSALE_DEMO_ACCESS_TOKEN` ✅ Already exists
     - `POSTGRES` ❌ Needs creation
     - `OP_SERVICE_ACCOUNT` ❌ Needs creation

3. **GitHub Secrets** (Only 1 required!)
   - `OP_SERVICE_ACCOUNT_TOKEN` - 1Password CI/CD service account

## Architecture

```
┌─────────────────────────────────────────────┐
│           Hetzner Cloud Server              │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │   Nginx (Port 80/443)               │   │
│  │   - Reverse Proxy                   │   │
│  │   - Rate Limiting                   │   │
│  │   - SSL Termination                 │   │
│  └──────────────┬──────────────────────┘   │
│                 │                           │
│  ┌──────────────▼──────────────────────┐   │
│  │   App Container (Port 3000)         │   │
│  │   - Bun Runtime                     │   │
│  │   - 1Password CLI                   │   │
│  │   - Secret Injection                │   │
│  └──────────────┬──────────────────────┘   │
│                 │                           │
│  ┌──────────────▼──────────────────────┐   │
│  │   PostgreSQL (Port 5432)            │   │
│  │   - Persistent Volume               │   │
│  │   - Auto Schema Init                │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Setup Instructions

### Step 1: Set Up 1Password Secrets

✅ **SSH Keys are already configured** in `op://Dev/HETZNER_SSH_KEY`

❌ **You need to create these secrets**:

Follow the detailed guide: [1PASSWORD_SETUP.md](.github/workflows/1PASSWORD_SETUP.md)

Quick setup:
```bash
# 1. Create PostgreSQL password in Dev vault
op item create --category=password --title="POSTGRES" --vault=Dev \
  "password[password]=$(openssl rand -base64 32)"

# 2. Create runtime service account in 1Password UI
#    Name: "AI SKU Alerts Runtime"
#    Access: Dev vault (read-only)
#    Then store the token:
op item create --category=password --title="OP_SERVICE_ACCOUNT" --vault=Dev \
  "token[password]=YOUR_RUNTIME_SERVICE_ACCOUNT_TOKEN"

# 3. Verify secrets are accessible
op read "op://Dev/HETZNER_SERVER_IP/server"
op read "op://Dev/POSTGRES/password"
op read "op://Dev/OP_SERVICE_ACCOUNT/token"
```

### Step 2: Configure GitHub Secret (Only 1!)

```bash
# Install GitHub CLI if needed
brew install gh

# Authenticate
gh auth login

# Create CI/CD service account in 1Password UI first:
#    Name: "AI SKU Alerts CI/CD"
#    Access: Dev vault (read-only)
# Then set the GitHub secret:
gh secret set OP_SERVICE_ACCOUNT_TOKEN
# Paste the CI/CD service account token

# Verify
gh secret list
# Should show: OP_SERVICE_ACCOUNT_TOKEN
```

### Step 3: Test Secret Injection Locally

```bash
# Test that op inject works with your service account
op inject -i .env.tpl -o .env.test
cat .env.test
rm .env.test
```

You should see all `op://...` references replaced with actual values.

### Step 4: Initial Server Setup (Optional)

✅ **SSH access is already working** to `46.62.158.249`

Optionally configure the server manually:

```bash
# SSH into server
ssh root@46.62.158.249

# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y curl git unzip

# Setup firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## Deployment

### Manual Deployment via GitHub Actions

Deployments are **manual-only** for safety. To deploy:

1. Go to: [GitHub Actions - Deploy to Hetzner](https://github.com/nach/aiskualerts/actions/workflows/deploy.yml)
2. Click "Run workflow"
3. Click "Run workflow" (no environment selection needed - single environment)

The workflow will:
1. Load SSH key and server IP from 1Password
2. Run `op inject -i .env.tpl -o .env` in GitHub Actions
3. Rsync files to server (including `.env`)
4. SSH to server and run `docker compose up -d --build`
5. Verify deployment health

**What gets synced**:
- Source code (`src/`)
- Docker configuration (`Dockerfile`, `docker-compose.yml`, `nginx.conf`)
- `.env` file (with secrets resolved)
- Excludes: `node_modules`, `.git`, `tests`, `coverage`, `.env.tpl`

**Security**:
- Only 1 GitHub secret needed: `OP_SERVICE_ACCOUNT_TOKEN`
- `.env` has `chmod 600` permissions
- `.env.tpl` stays in git (safe - only contains references)
- Docker auto-installed on first deployment

### Local Deployment Testing

Test the deployment locally:

```bash
# 1. Test SSH connection
ssh root@46.62.158.249 "echo 'Connection works'"

# 2. Test secret injection
op inject -i .env.tpl -o .env.test
cat .env.test
rm .env.test

# 3. Manual deployment (if needed)
# Generate .env
op inject -i .env.tpl -o .env
chmod 600 .env

# Rsync to server
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'tests' \
  --exclude 'coverage' \
  --exclude '.env.tpl' \
  ./ root@46.62.158.249:/opt/aiskualerts/

# Deploy
ssh root@46.62.158.249 "cd /opt/aiskualerts && docker compose up -d --build"

# Clean up local .env
rm .env
```

**Note**: For production, always use the GitHub Actions workflow.


## Monitoring & Maintenance

### View Logs

```bash
# SSH into server
ssh -i ~/.ssh/hetzner_key root@YOUR_SERVER_IP

# View all container logs
cd /opt/aiskualerts
docker compose logs -f

# View specific service logs
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f nginx
```

### Container Management

```bash
# SSH into server
cd /opt/aiskualerts

# View status
docker compose ps

# Restart services
docker compose restart app

# Stop all services
docker compose down

# Start services
docker compose up -d

# Rebuild and restart
docker compose up -d --build
```

### Database Access

```bash
# SSH into server
cd /opt/aiskualerts

# Access PostgreSQL
docker compose exec postgres psql -U aiskualerts -d aiskualerts

# Backup database
docker compose exec postgres pg_dump -U aiskualerts aiskualerts > backup.sql

# Restore database
cat backup.sql | docker compose exec -T postgres psql -U aiskualerts -d aiskualerts
```

### System Updates

```bash
# SSH into server
apt update && apt upgrade -y

# Update Docker images
cd /opt/aiskualerts
docker compose pull
docker compose up -d

# Clean up old images
docker image prune -a -f
```

## SSL/TLS Configuration (Optional)

To enable HTTPS with Let's Encrypt:

1. **Install Certbot**:
```bash
apt install -y certbot python3-certbot-nginx
```

2. **Update nginx.conf** to uncomment HTTPS block and configure your domain

3. **Generate certificates**:
```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

4. **Auto-renewal**:
```bash
certbot renew --dry-run
```

## Troubleshooting

### Container won't start
```bash
docker compose logs app
docker compose ps
```

### Database connection issues
```bash
# Check if postgres is healthy
docker compose ps postgres

# Check database logs
docker compose logs postgres

# Verify connection string
docker compose exec app env | grep DATABASE_URL
```

### 1Password secret injection issues
```bash
# Test 1Password CLI
docker compose exec app op --version

# Check if service account token is set
docker compose exec app env | grep OP_SERVICE_ACCOUNT_TOKEN
```

### Port conflicts
```bash
# Check what's using ports
lsof -i :80
lsof -i :443
lsof -i :3000
lsof -i :5432
```

## Security Best Practices

1. **Never commit secrets** - Use 1Password for all credentials
2. **Enable firewall** - Only allow necessary ports
3. **Regular updates** - Keep system and Docker images updated
4. **Monitor logs** - Check for suspicious activity
5. **Backup database** - Regular automated backups
6. **Use SSL/TLS** - Enable HTTPS in production
7. **Rotate credentials** - Regularly update passwords and tokens
8. **Limit SSH access** - Use SSH keys only, disable password auth
9. **Configure CORS** - Always set `ALLOWED_ORIGINS` in production (see below)

### CORS Configuration (Required)

The `ALLOWED_ORIGINS` environment variable is **required** in production. The server will fail to start without it configured.

```bash
# Single origin
ALLOWED_ORIGINS=https://aiskualerts.com

# Multiple origins (comma-separated)
ALLOWED_ORIGINS=https://aiskualerts.com,https://app.aiskualerts.com
```

This prevents cross-origin requests from unauthorized domains. In development/test mode, if not set, all origins are allowed for convenience.

## Cost Optimization

- Use Hetzner's cheapest server for staging (CX11: 2.49€/month)
- Use CX21 or CX31 for production depending on load
- Enable Docker image cleanup in deployment script
- Monitor resource usage with `htop` and `docker stats`

## Next Steps

1. Set up monitoring (e.g., Uptime Robot, Grafana)
2. Configure automated backups
3. Set up staging environment
4. Configure SSL/TLS certificates
5. Set up log aggregation
6. Configure alerting for critical errors
