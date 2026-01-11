# Server Setup Guide

This guide covers the one-time setup required for deploying AI SKU Alerts to a Hetzner Cloud server.

## Prerequisites

- **Server**: Ubuntu 24.04 LTS (Hetzner Cloud VPS)
- **Access**: Root SSH access to the server
- **Local**: 1Password CLI installed locally for secret management

## One-Time Server Provisioning

### Option A: Automated Setup (Recommended)

Use the provided provisioning script:

```bash
# On your local machine
# 1. Get server IP from 1Password
SERVER_IP=$(op read "op://Dev/HETZNER_SERVER_IP/credential")

# 2. Get SSH key from 1Password
op read "op://Dev/HETZNER_SSH_KEY/private key" > /tmp/hetzner_key
chmod 600 /tmp/hetzner_key

# 3. Copy and run provision script
scp -i /tmp/hetzner_key scripts/provision.sh root@$SERVER_IP:/tmp/
ssh -i /tmp/hetzner_key root@$SERVER_IP 'bash /tmp/provision.sh'

# 4. Cleanup
rm /tmp/hetzner_key
```

The provision script will:
- ✅ Install Docker and Docker Compose
- ✅ Create application directory at `/opt/aiskualerts`
- ✅ Configure firewall (ports 22, 80, 443)
- ✅ Enable Docker service

### Option B: Manual Setup

If you prefer to set up manually:

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Install Docker
apt-get update
apt-get install -y docker.io docker-compose-v2

# Enable Docker service
systemctl enable docker
systemctl start docker

# Create application directory
mkdir -p /opt/aiskualerts

# Configure firewall (if using UFW)
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
```

## Verify Setup

After provisioning, verify everything is ready:

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Check Docker version
docker --version
# Should show: Docker version 24.x.x or higher

# Check Docker Compose version
docker compose version
# Should show: Docker Compose version v2.x.x or higher

# Check application directory
ls -la /opt/aiskualerts
# Should exist and be owned by root

# Verify Docker service is running
systemctl status docker
# Should show: active (running)
```

## What Gets Deployed

After deployment via GitHub Actions, your server will have:

```
/opt/aiskualerts/
├── aiskualerts.tar.gz          # Docker image (compressed)
├── .env                        # Secrets (generated from 1Password)
├── docker-compose.yml          # Container orchestration
├── nginx.conf                  # Nginx reverse proxy config
├── src/
│   └── db/
│       └── schema.sql         # Database initialization
└── backups/
    └── aiskualerts-*.tar.gz   # Previous images (for rollback)
```

## What's NOT on the Server

For security, these are intentionally excluded:

- ❌ No 1Password CLI
- ❌ No OP_SERVICE_ACCOUNT_TOKEN
- ❌ No source code (only compiled Docker image)
- ❌ No .env.tpl template
- ❌ No git repository
- ❌ No node_modules (bundled in image)

## First Deployment

After server setup, trigger the first deployment:

1. **Via GitHub Actions UI**:
   - Go to Actions tab
   - Select "Deploy to Hetzner" workflow
   - Click "Run workflow"
   - Select branch (usually `main`)

2. **Via Git Push**:
   ```bash
   git push origin main
   ```

The deployment will automatically:
1. Build Docker image with 1Password secrets
2. Export to tar.gz
3. SCP to server
4. Load image and start containers
5. Verify health check

## Post-Deployment Operations

### View Application Logs

```bash
ssh root@YOUR_SERVER_IP
cd /opt/aiskualerts

# Follow all logs
docker compose logs -f

# Follow app logs only
docker compose logs -f app

# Follow postgres logs only
docker compose logs -f postgres

# View last 100 lines
docker compose logs --tail=100 app
```

### Check Container Status

```bash
ssh root@YOUR_SERVER_IP
cd /opt/aiskualerts

# View running containers
docker compose ps

# View detailed status
docker ps -a
```

### Restart Services

```bash
ssh root@YOUR_SERVER_IP
cd /opt/aiskualerts

# Restart all services
docker compose restart

# Restart app only
docker compose restart app

# Restart postgres only
docker compose restart postgres
```

### Stop Services

```bash
ssh root@YOUR_SERVER_IP
cd /opt/aiskualerts

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes data)
docker compose down -v
```

### Database Access

```bash
ssh root@YOUR_SERVER_IP
cd /opt/aiskualerts

# Connect to PostgreSQL
docker compose exec postgres psql -U aiskualerts -d aiskualerts

# Run SQL query
docker compose exec postgres psql -U aiskualerts -d aiskualerts -c "SELECT * FROM tenants;"

# Dump database
docker compose exec postgres pg_dump -U aiskualerts aiskualerts > backup.sql
```

### Rollback to Previous Version

If a deployment fails, you can rollback:

```bash
ssh root@YOUR_SERVER_IP
cd /opt/aiskualerts

# List available backups
ls -lh backups/

# Load previous image
docker load < backups/aiskualerts-YYYYMMDD-HHMMSS.tar.gz

# Restart containers
docker compose down
docker compose up -d
```

## Security Best Practices

1. **SSH Access**: Use key-based authentication only, disable password auth
2. **Firewall**: Keep only necessary ports open (22, 80, 443)
3. **Updates**: Regularly update server packages:
   ```bash
   apt-get update && apt-get upgrade -y
   ```
4. **Secrets**: Never store secrets in plain text on server
5. **Backups**: Regularly backup PostgreSQL data volume

## Troubleshooting

### Application Not Starting

```bash
# Check logs
docker compose logs app

# Check if port 3000 is already in use
lsof -i :3000

# Verify .env file exists
ls -la .env
```

### Database Connection Issues

```bash
# Check postgres container health
docker compose ps postgres

# View postgres logs
docker compose logs postgres

# Verify database is ready
docker compose exec postgres pg_isready -U aiskualerts
```

### Nginx Not Working

```bash
# Check nginx configuration
docker compose exec nginx nginx -t

# View nginx logs
docker compose logs nginx

# Verify SSL certificates exist
ls -la ssl/
```

### Disk Space Issues

```bash
# Check disk usage
df -h

# Clean up old Docker images
docker image prune -a -f

# Clean up old backups (keeps last 3)
cd /opt/aiskualerts/backups
ls -t aiskualerts-*.tar.gz | tail -n +4 | xargs rm
```

## Monitoring

### Health Check

```bash
# From server
curl http://localhost:3000/health

# From outside
curl http://YOUR_SERVER_IP/health
```

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
du -sh /opt/aiskualerts/*

# PostgreSQL database size
docker compose exec postgres psql -U aiskualerts -d aiskualerts -c "
  SELECT pg_size_pretty(pg_database_size('aiskualerts'));
"
```

## SSL Certificate Setup (Let's Encrypt)

SSL is configured using Let's Encrypt with automatic renewal via certbot.

### Initial Certificate Setup (One-Time)

```bash
# SSH into server
ssh root@46.62.158.249

# Install certbot
apt update && apt install -y certbot

# Stop nginx to free port 80
cd /opt/aiskualerts && docker compose stop nginx

# Obtain certificate
certbot certonly --standalone -d aiskualerts.com -d www.aiskualerts.com

# Create certbot webroot directory (for renewals)
mkdir -p /var/www/certbot

# Restart nginx
docker compose up -d nginx

# Verify HTTPS works
curl -I https://aiskualerts.com/health
```

### Certificate Renewal

Certbot automatically sets up a systemd timer for renewal. Verify it's active:

```bash
# Check timer status
systemctl status certbot.timer

# Test renewal (dry run)
certbot renew --dry-run
```

For renewal to work with nginx running, you need to reload nginx after renewal:

```bash
# Create renewal hook
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
cd /opt/aiskualerts && docker compose exec nginx nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### Certificate Locations

- **Certificate**: `/etc/letsencrypt/live/aiskualerts.com/fullchain.pem`
- **Private Key**: `/etc/letsencrypt/live/aiskualerts.com/privkey.pem`
- **Renewal Config**: `/etc/letsencrypt/renewal/aiskualerts.com.conf`

### Troubleshooting SSL

```bash
# Check certificate expiry
openssl x509 -dates -noout -in /etc/letsencrypt/live/aiskualerts.com/fullchain.pem

# Test SSL configuration
curl -vI https://aiskualerts.com 2>&1 | grep -E "(SSL|subject|expire)"

# Check nginx SSL config
docker compose exec nginx nginx -t

# View certbot logs
tail -f /var/log/letsencrypt/letsencrypt.log
```

## Next Steps

- Set up automated backups
- Configure monitoring and alerts
- Review and optimize Docker image size
- Plan database backup strategy
