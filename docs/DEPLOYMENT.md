# Deployment & Migrations

This guide covers how deployments work and how database migrations are managed.

## Overview

AISku Alerts uses:
- **GitHub Actions** for CI/CD pipeline
- **Docker Compose** for container orchestration
- **dbmate** for database migrations
- **1Password** for secrets management

## Deployment Flow

### Automatic Deployment

Deployments are triggered automatically on push to `main`:

```
Push to main → Build Docker Image → Push to GHCR → Deploy to Server → Verify Health
```

### Manual Deployment

Trigger via GitHub Actions UI:
1. Go to Actions tab
2. Select "Deploy" workflow
3. Click "Run workflow"

## How Deployment Works

The deploy workflow (`.github/workflows/deploy.yml`) does:

1. **Build & Push Image**
   - Builds Docker image
   - Pushes to GitHub Container Registry (GHCR)
   - Tags with both `latest` and commit SHA

2. **Generate Secrets**
   - Uses 1Password CLI to inject secrets from `.env.tpl`
   - Constructs `DATABASE_URL` with `?sslmode=disable`

3. **Copy Files to Server**
   ```
   /opt/aiskualerts/
   ├── .env                    # Generated secrets
   ├── docker-compose.yml      # Container orchestration
   ├── nginx.conf              # Reverse proxy config
   └── db/
       ├── migrations/         # dbmate migration files
       └── schema.sql          # Generated schema (for reference)
   ```

4. **Deploy on Server**
   ```bash
   docker compose down
   docker compose up -d
   ```

5. **Verify Health**
   - Waits for `http://localhost:3000/health` to return 200

## Database Migrations

### Migration System: dbmate

We use [dbmate](https://github.com/amacneil/dbmate) as the single source of truth for database schema.

**Key principles:**
- Migrations are the authoritative source of schema
- `db/schema.sql` is generated (never edit manually)
- Fresh and incremental databases produce identical schema

### Migration Files

Located in `db/migrations/` with timestamp naming:

```
db/migrations/
├── 20240101000001_initial_schema.sql
├── 20240115000002_add_digest_frequency.sql
├── 20240201000003_encrypt_access_tokens.sql
└── ...
```

Each file has `up` and `down` sections:

```sql
-- migrate:up
CREATE TABLE example (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

-- migrate:down
DROP TABLE IF EXISTS example;
```

### How Migrations Run in Production

Docker Compose handles migration ordering automatically:

```yaml
services:
  postgres:
    # ... starts first, has healthcheck

  migrations:
    image: ghcr.io/amacneil/dbmate:2.22
    command: ["--wait", "--wait-timeout", "30s", "up"]
    depends_on:
      postgres:
        condition: service_healthy

  app:
    depends_on:
      postgres:
        condition: service_healthy
      migrations:
        condition: service_completed_successfully  # Key!
```

**Flow:**
1. PostgreSQL starts and becomes healthy
2. Migrations container runs `dbmate up`
3. Migrations container exits with code 0 (success)
4. App container starts (only after migrations succeed)
5. App validates schema at startup (defense-in-depth)

### Creating a New Migration

```bash
# Install dbmate locally (macOS)
brew install dbmate

# Create new migration
dbmate new add_feature_x

# This creates: db/migrations/YYYYMMDDHHMMSS_add_feature_x.sql
```

Edit the migration file, then:

```bash
# Apply migrations locally
dbmate up

# Regenerate schema.sql (REQUIRED after any migration change)
dbmate dump
```

### Important: Always Regenerate schema.sql

After creating or modifying migrations:

```bash
dbmate up && dbmate dump
git add db/migrations/ db/schema.sql
git commit -m "feat: add migration for feature X"
```

CI verifies schema.sql matches migrations (`.github/workflows/schema-verify.yml`).

### Runtime Schema Validation

The app validates schema at startup (`src/db/validate.ts`):

- Checks `schema_migrations` table has required version
- Verifies critical tables exist
- Exits with code 1 if validation fails

This is defense-in-depth - even if Docker ordering fails, the app won't start with wrong schema.

## DATABASE_URL Configuration

**Important:** The `DATABASE_URL` must include `?sslmode=disable` for internal Docker connections:

```
DATABASE_URL=postgresql://user:pass@postgres:5432/dbname?sslmode=disable
```

The PostgreSQL container doesn't have SSL enabled, and dbmate requires explicit SSL configuration.

## Troubleshooting Deployments

### Deploy Fails at "Verify Health"

Check app logs:
```bash
ssh aiskualerts "cd /opt/aiskualerts && docker compose logs app"
```

Common causes:
- Schema validation failure (migrations didn't run)
- Missing environment variables
- Database connection issues

### Migrations Failed

Check migration logs:
```bash
ssh aiskualerts "docker logs aiskualerts-migrations"
```

Common causes:
- SSL connection error → Add `?sslmode=disable` to DATABASE_URL
- "relation already exists" → Schema drift, see recovery below

### Manual Recovery

If deployment is broken:

```bash
ssh aiskualerts
cd /opt/aiskualerts

# Check current state
docker compose ps -a

# View logs
docker compose logs

# Restart everything
docker compose down
docker compose up -d

# Verify
curl http://localhost:3000/health
```

### Schema Drift Recovery

If `schema_migrations` table is out of sync:

```bash
ssh aiskualerts
cd /opt/aiskualerts

# Connect to database
docker exec -it aiskualerts-db psql -U aiskualerts -d aiskualerts

# Check current migrations
SELECT * FROM schema_migrations ORDER BY version;

# If using old integer format, convert to dbmate format:
DROP TABLE schema_migrations;
CREATE TABLE schema_migrations (version VARCHAR(128) PRIMARY KEY);
INSERT INTO schema_migrations (version) VALUES
    ('20240101000001'),
    ('20240115000002'),
    -- ... all your migration versions
    ('20240601000011');
```

Then restart:
```bash
docker compose down
docker compose up -d
```

## Local Development

### Running Migrations Locally

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/aiskualerts?sslmode=disable"

# Apply pending migrations
dbmate up

# Rollback last migration
dbmate down

# Check status
dbmate status
```

### Using Docker Compose Locally

```bash
# Start all services including migrations
docker compose up -d

# Watch logs
docker compose logs -f
```

## CI/CD Checks

### Schema Verification (`.github/workflows/schema-verify.yml`)

On every PR that touches `db/**`:
1. Spins up PostgreSQL
2. Applies all migrations with dbmate
3. Dumps schema
4. Compares with committed `db/schema.sql`
5. Fails if they don't match

### Main CI (`.github/workflows/ci.yml`)

- Lint & Type Check
- Unit Tests
- Database Integration Tests
- Docker Build Validation

## Configuration Files

| File | Purpose |
|------|---------|
| `.dbmate.yml` | dbmate configuration |
| `docker-compose.yml` | Container orchestration |
| `.github/workflows/deploy.yml` | Deployment workflow |
| `.github/workflows/schema-verify.yml` | Schema consistency check |
| `src/db/validate.ts` | Runtime schema validation |

## Quick Reference

```bash
# Create migration
dbmate new migration_name

# Apply migrations
dbmate up

# Rollback one migration
dbmate down

# Regenerate schema.sql
dbmate dump

# Check migration status
dbmate status

# SSH to production
ssh aiskualerts

# View production logs
ssh aiskualerts "cd /opt/aiskualerts && docker compose logs -f app"

# Manual production restart
ssh aiskualerts "cd /opt/aiskualerts && docker compose down && docker compose up -d"
```
