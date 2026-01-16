# GitHub Actions Workflows

This directory contains CI/CD workflows for the AI SKU Alerts project.

## Workflows

### 🔄 CI (`ci.yml`)

**Triggers:** Every push and pull request to any branch

**Jobs:**
1. **Lint & Type Check**
   - Runs ESLint with security rules
   - Verifies TypeScript type safety

2. **Unit Tests**
   - Runs all unit tests (fast, no external dependencies)
   - Generates code coverage report
   - Enforces 100% coverage requirement

3. **Database Integration Tests**
   - Spins up PostgreSQL 16 service
   - Runs database integration tests
   - Tests schema, migrations, and data operations

4. **All Tests Passed**
   - Final status check
   - Ensures all jobs completed successfully

**Duration:** ~2-3 minutes

**Requirements:** None (all dependencies are self-contained)

---

### 🌐 E2E Tests (`e2e.yml`)

**Triggers:**
- Manual dispatch (via GitHub UI)
- Scheduled daily at 2 AM UTC

**Jobs:**
1. **E2E Tests (Bsale API)**
   - Loads secrets from 1Password using service account
   - Tests against live Bsale demo API
   - Validates real-world integration
   - Verifies API contract compliance

**Duration:** ~30-40 seconds

**Requirements:**
- GitHub Secret (only one needed!):
  - `OP_SERVICE_ACCOUNT_TOKEN`: 1Password service account token
- 1Password vault with Bsale credentials (auto-loaded at runtime)

---

## Setting Up Secrets

### Zero-Secrets Architecture with 1Password ✅

This project uses **1Password service accounts** for secret management in CI/CD, maintaining the same zero-secrets-on-disk philosophy from local development.

**Setup Steps:**

1. **Create a 1Password Service Account**
   ```bash
   # Via 1Password web console or CLI
   # Save the service account token securely
   ```

2. **Add Service Account Token to GitHub**
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `OP_SERVICE_ACCOUNT_TOKEN`
   - Value: Your 1Password service account token
   - Click **Add secret**

3. **Ensure 1Password Vault Contains Required Items**
   - Vault: `Dev`
   - Item: `BSALE_DEMO_ACCESS_TOKEN`
   - Field: `credential` (contains the API token)

**That's it!** The E2E workflow will automatically:
1. Authenticate with 1Password using the service account
2. Fetch secrets from your vault at runtime
3. Inject them into the test environment
4. Clear them when the workflow completes

**Benefits:**
- ✅ Only **one** secret in GitHub (service account token)
- ✅ All other secrets managed in 1Password
- ✅ Same `.env.tpl` references work locally and in CI
- ✅ Centralized secret rotation (update once in 1Password)
- ✅ Audit trail via 1Password access logs

---

## Running Workflows Manually

### E2E Tests
1. Go to **Actions** tab in GitHub
2. Select **E2E Tests** workflow
3. Click **Run workflow**
4. Select branch and click **Run workflow**

---

## Workflow Status Badges

Add these to your README.md:

```markdown
![CI](https://github.com/ignaciohermosillacornejo/aiskualerts/actions/workflows/ci.yml/badge.svg)
![E2E Tests](https://github.com/ignaciohermosillacornejo/aiskualerts/actions/workflows/e2e.yml/badge.svg)
```

---

## Local Testing

Before pushing, run the same checks locally:

```bash
# Quick check (lint + typecheck + unit tests)
bun run check

# Database tests (requires Docker)
bun run db:start
bun run test:integration:db
bun run db:stop

# E2E tests (requires 1Password CLI)
bun run test:integration:bsale
```

---

## Troubleshooting

### CI Workflow Failing

**Lint errors:**
```bash
bun run lint
```

**Type errors:**
```bash
bun run typecheck
```

**Test failures:**
```bash
bun test
```

### Database Tests Failing

**Issue:** PostgreSQL service not ready
**Solution:** The workflow includes health checks and wait logic. If issues persist, check PostgreSQL logs in the Actions output.

### E2E Tests Failing

**Issue:** Missing or invalid 1Password service account token
**Solution:**
1. Verify `OP_SERVICE_ACCOUNT_TOKEN` is configured in GitHub Secrets
2. Ensure the service account has access to the `Dev` vault
3. Check that the token hasn't expired

**Issue:** Secret not found in 1Password
**Solution:**
1. Verify the vault name matches: `Dev`
2. Verify the item exists: `BSALE_DEMO_ACCESS_TOKEN`
3. Verify the field name matches: `credential`
4. Check service account permissions

**Issue:** API rate limiting
**Solution:** E2E tests are scheduled to run daily to avoid rate limits. Manual runs should be spaced out.

---

## Best Practices

1. **Always run `bun run check` before pushing**
2. **Wait for CI to pass before merging PRs**
3. **Monitor E2E tests for API changes**
4. **Keep dependencies up to date**
5. **Maintain 100% code coverage**

---

## Production Deployment (Hetzner)

The same 1Password approach extends to production deployments:

**Setup:**
1. Create a separate 1Password service account for production
2. Store `OP_SERVICE_ACCOUNT_TOKEN` on Hetzner server (secure location)
3. Use `op inject` in Docker Compose startup script:
   ```bash
   # In production startup script
   export OP_SERVICE_ACCOUNT_TOKEN="ops_..."
   op inject -i .env.tpl -o /tmp/.env
   docker compose --env-file /tmp/.env up -d
   rm /tmp/.env  # Clean up after injection
   ```

**Benefits:**
- Same `.env.tpl` file works across all environments
- Secrets never committed to Git
- Single source of truth (1Password)
- Easy secret rotation without redeployment

---

---

### 🔒 CodeQL Security Analysis (`codeql.yml`)

**Triggers:**
- Push to main/master branches
- Pull requests to main/master branches
- Scheduled weekly on Monday at 3 AM UTC
- Manual dispatch

**Jobs:**
1. **Analyze**
   - Initializes CodeQL for JavaScript/TypeScript
   - Runs security-extended and security-and-quality queries
   - Uploads results to GitHub Security tab

**Duration:** ~3-5 minutes

**Requirements:** None (uses GitHub's built-in CodeQL)

---

### 🚀 Deploy (`deploy.yml`)

**Triggers:**
- Automatic on push/merge to main branch
- Manual dispatch (via GitHub UI)

**Jobs:**
1. **Build and Push**
   - Builds Docker image with Bun runtime
   - Pushes to GitHub Container Registry (ghcr.io)
   - Tags with both `latest` and git SHA

2. **Deploy to Server**
   - Loads secrets from 1Password
   - Copies deployment files to Hetzner server via SSH
   - Pulls new Docker image
   - Runs database migrations
   - Performs health check verification

**Duration:** ~3-5 minutes

**Requirements:**
- `OP_SERVICE_ACCOUNT_TOKEN`: 1Password service account token
- 1Password vault with:
  - Production database credentials
  - Hetzner server IP and SSH key
  - Bsale API credentials
  - Email service credentials

---

### 🚀 Release Automation (`release.yml`)

**Triggers:**
- Manual dispatch with release type selection (patch/minor/major)
- Optional dry-run mode for testing

**Jobs:**
1. **Create Release**
   - Runs full check suite (lint, typecheck, tests)
   - Generates changelog from conventional commits
   - Creates GitHub release with release notes
   - Tags the release with semantic version

2. **Changelog PR**
   - Updates CHANGELOG.md with release notes
   - Creates summary of changes

**Duration:** ~3-5 minutes

**Requirements:**
- `GITHUB_TOKEN` (automatically provided by GitHub Actions)
- Conventional commit messages (enforced by commitlint)

**Usage:**
```bash
# Dry run (test without releasing)
bun run release:dry

# Create releases
bun run release:patch  # 1.0.0 -> 1.0.1
bun run release:minor  # 1.0.0 -> 1.1.0
bun run release:major  # 1.0.0 -> 2.0.0
```

---

## Dependabot Configuration

Located at `.github/dependabot.yml`, Dependabot is configured to:

- **npm dependencies**: Weekly updates on Mondays at 9 AM (America/Santiago)
- **GitHub Actions**: Weekly updates grouped together
- **Docker**: Weekly updates for container images

**Features:**
- Groups minor/patch updates to reduce PR noise
- Separate groups for production and dev dependencies
- Ignores major React updates (requires manual review)
- Conventional commit prefixes (`chore(deps)`, `ci(deps)`)

---

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint.

**Format:**
```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks
- `revert`: Reverting commits

**Examples:**
```bash
git commit -m "feat: add user authentication"
git commit -m "fix(api): handle null response"
git commit -m "docs: update README with setup instructions"
```

---

## Future Improvements

- [ ] Add performance benchmarking
- [x] Add deployment workflows with 1Password integration
