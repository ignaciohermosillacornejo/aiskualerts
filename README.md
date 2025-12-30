# AI SKU Alerts

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
- **CI/CD:** GitHub Actions + AI code review

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

## Documentation

### Knowledge Base
- [docs/TESTING.md](docs/TESTING.md) - Testing guide
- [docs/SECRETS.md](docs/SECRETS.md) - 1Password secret management

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
