# AI SKU Alerts

[![CI](https://github.com/ignaciohermosillacornejo/aiskualerts/actions/workflows/ci.yml/badge.svg)](https://github.com/ignaciohermosillacornejo/aiskualerts/actions/workflows/ci.yml)
[![E2E Tests](https://github.com/ignaciohermosillacornejo/aiskualerts/actions/workflows/e2e.yml/badge.svg)](https://github.com/ignaciohermosillacornejo/aiskualerts/actions/workflows/e2e.yml)

Multi-tenant SaaS that connects to Bsale accounts via OAuth, monitors stock levels, and alerts users of critical shortages via daily email digests.

## Quick Start

```bash
# Install dependencies
bun install

# Run unit tests (fast)
bun test

# Run integration tests (requires 1Password CLI)
bun run test:integration

# Lint & typecheck
bun run check
```

## Tech Stack

- **Runtime:** Bun (not Node.js)
- **Database:** PostgreSQL via `Bun.sql` (no ORM)
- **Frontend:** React + Tailwind + shadcn/ui
- **Infrastructure:** Hetzner VPS + Terraform + Docker Compose + Caddy
- **Source Control:** Sapling SCM (Git-compatible stacked PRs)
- **CI/CD:** GitHub Actions (lint, typecheck, unit tests, database tests, E2E tests)

## Project Status

### ✅ Phase 1: Foundations & Infrastructure (Complete)
- Database schema with multi-tenancy
- Bsale API client with pagination & rate limiting
- 100% unit test coverage
- E2E integration tests against live API
- 1Password secret management

### ⏸️ Phase 2: OAuth & Tenant Onboarding (Waiting for Bsale App Approval)
- Bsale OAuth flow
- Tenant creation with access token storage
- Cookie-based session management
- Initial stock sync trigger

### 📋 Future Phases
- Phase 3: Sync & Alert Engine
- Phase 4: Notifications
- Phase 5: Web App & Dashboard
- Phase 6: Production Deployment

See [plan/plan.md](plan/plan.md) for detailed roadmap.

## Architecture

### Multi-Tenancy
Single database with `tenant_id` column for data isolation.

### Security
**Zero secrets on disk** - All secrets managed via 1Password CLI:
- Local: Fetched at runtime via `op run`
- Production: Injected at container startup via `op inject`

See [docs/SECRETS.md](docs/SECRETS.md) for details.

### Database
PostgreSQL with raw SQL queries (no ORM):
- Tenants & users
- Stock snapshots (daily sync)
- User-defined thresholds
- Alert history

See [src/db/schema.sql](src/db/schema.sql) for schema.

### Bsale Integration
Auto-paginating API client with:
- Rate limiting (configurable delay)
- Retry logic with exponential backoff
- Type-safe Zod validation
- Multi-country support (CL, PE, MX)

See [src/bsale/client.ts](src/bsale/client.ts) for implementation.

## Development

### Project Constraints (MANDATORY)
- Use Bun, not Node.js
- PostgreSQL via `Bun.sql` only (no ORMs)
- 100% code coverage for business logic
- Strict TypeScript (no `any`)
- Functional programming patterns
- Raw SQL with tagged templates

See [CLAUDE.md](CLAUDE.md) for full constraints.

### Running Tests

```bash
# Unit tests (fast, no external dependencies)
bun test

# Integration tests (requires 1Password CLI)
bun run test:integration

# All tests
bun run test:all

# Coverage report
bun run test:coverage

# Full quality check
bun run check
```

See [docs/TESTING.md](docs/TESTING.md) for testing guide.

### Secret Management

**Local Development:**
```bash
# Automatic 1Password injection
bun run test:integration

# Manual injection
op run --env-file=.env.tpl -- bun index.ts
```

**No `.env` files!** Secrets are:
- Stored in 1Password vaults
- Referenced in `.env.tpl` (safe to commit)
- Fetched at runtime (never on disk)

See [docs/SECRETS.md](docs/SECRETS.md) for setup.

### Code Quality

```bash
# Linting
bun run lint

# Type checking
bun run typecheck

# Full check (lint + typecheck + test)
bun run check
```

### CI/CD

GitHub Actions workflows run automatically on every push and pull request:

**CI Workflow** (`.github/workflows/ci.yml`):
- ✅ Lint & type check
- ✅ Unit tests with coverage
- ✅ Database integration tests (PostgreSQL service)

**E2E Workflow** (`.github/workflows/e2e.yml`):
- 🌐 Bsale API integration tests
- 🔐 Uses 1Password service account (zero secrets in GitHub!)
- ⏰ Runs daily at 2 AM UTC
- 🔧 Manual trigger available

**Secret Management:**
- Only `OP_SERVICE_ACCOUNT_TOKEN` stored in GitHub
- All other secrets fetched from 1Password at runtime
- Same zero-secrets philosophy as local development

See [.github/workflows/README.md](.github/workflows/README.md) for setup.

## Deployment

### One-Time Server Setup

Provision a new Hetzner server with Docker:

```bash
# Get server IP from 1Password
SERVER_IP=$(op read "op://Dev/HETZNER_SERVER_IP/credential")

# Run provisioning script
scp scripts/provision.sh root@$SERVER_IP:/tmp/
ssh root@$SERVER_IP 'bash /tmp/provision.sh'
```

See [docs/SERVER_SETUP.md](docs/SERVER_SETUP.md) for detailed setup guide.

### Deploying to Production

**Automatic**: Push to `main` branch triggers GitHub Actions deployment

**Manual**: Run via GitHub Actions UI:
1. Go to Actions → Deploy to Hetzner
2. Click "Run workflow"
3. Select branch and deploy

**Deployment Process** (Automated via GitHub Actions):
1. 🔐 Inject secrets from 1Password → `.env`
2. 🐳 Build Docker image with Bun + dependencies
3. 📦 Export image to `aiskualerts.tar.gz`
4. 🚀 SCP tar + `.env` + configs to Hetzner server
5. ⚡ Load image + start containers via `docker compose`
6. ✅ Verify health check

**What's on the server**:
- Docker image (built in CI)
- `.env` file (generated fresh each deployment)
- `docker-compose.yml` (orchestration)

**What's NOT on the server**:
- No 1Password CLI or tokens
- No source code
- No git repository
- No build dependencies

### Server Operations

```bash
# View logs
ssh root@SERVER_IP
cd /opt/aiskualerts
docker compose logs -f

# Restart services
docker compose restart

# Rollback to previous version
docker load < backups/aiskualerts-YYYYMMDD-HHMMSS.tar.gz
docker compose up -d
```

See [docs/SERVER_SETUP.md](docs/SERVER_SETUP.md) for complete operations guide.

## Documentation

### Knowledge Base
- [docs/TESTING.md](docs/TESTING.md) - Testing guide
- [docs/SECRETS.md](docs/SECRETS.md) - 1Password secret management
- [docs/SERVER_SETUP.md](docs/SERVER_SETUP.md) - Server setup & operations guide

### Planning
- [plan/plan.md](plan/plan.md) - Implementation roadmap
- [plan/status/](plan/status/) - Phase completion reports
- [plan/01_infrastructure_manifest.md](plan/01_infrastructure_manifest.md) - Infrastructure setup
- [plan/05_database_schema.md](plan/05_database_schema.md) - Database design
- [plan/06_bsale_integration.md](plan/06_bsale_integration.md) - Bsale API integration
- [plan/07_project_structure.md](plan/07_project_structure.md) - Directory layout

## Project Structure

```
aiskualerts/
├── src/
│   ├── bsale/          # Bsale API client
│   ├── db/             # Database layer
│   ├── lib/            # Shared utilities
│   ├── sync/           # (Phase 3)
│   ├── alerts/         # (Phase 3)
│   ├── notifications/  # (Phase 4)
│   ├── api/            # (Phase 2)
│   └── frontend/       # (Phase 5)
├── tests/
│   ├── bsale/
│   │   ├── client.test.ts              # Unit tests
│   │   └── client.integration.test.ts  # E2E tests
│   └── ...
├── docs/               # Documentation
├── plan/               # Planning & status
├── .env.tpl            # 1Password secret references
├── CLAUDE.md           # Project constraints
└── README.md           # This file
```

## Configuration

### Environment Variables

All secrets managed via 1Password. See `.env.tpl` for references.

Required for integration tests:
- `BSALE_ACCESS_TOKEN` - Bsale demo API token
- `BSALE_API_BASE_URL` - API base URL

## Contributing

### Adding New Features

1. **Plan first** (if non-trivial)
2. **Write tests** (TDD encouraged)
3. **Implement** (following constraints in CLAUDE.md)
4. **Ensure coverage** (`bun run test:coverage`)
5. **Document** (update relevant docs)

### Adding Secrets

1. Store in 1Password (via app or CLI)
2. Add reference to `.env.tpl`:
   ```bash
   NEW_SECRET=op://Vault/Item/field
   ```
3. Commit `.env.tpl` (safe - no actual secrets)

See [docs/SECRETS.md](docs/SECRETS.md) for details.

## License

Private project.

## Contact

For Bsale app approval or questions, contact: [your-contact]

---

**Current Phase:** 1 (Complete) ✅
**Next Phase:** 2 (Waiting for Bsale approval) ⏸️
**Test Coverage:** 100% ✅
**Secrets on Disk:** Zero ✅
