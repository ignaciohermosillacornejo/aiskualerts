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
   - Tests against live Bsale demo API
   - Validates real-world integration
   - Verifies API contract compliance

**Duration:** ~30-40 seconds

**Requirements:**
- GitHub Secrets must be configured:
  - `BSALE_ACCESS_TOKEN`: Access token for Bsale demo API
  - `BSALE_API_BASE_URL`: Base URL for Bsale API (e.g., `https://api.bsale.io`)

---

## Setting Up Secrets

To enable E2E tests, configure the following secrets in your repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `BSALE_ACCESS_TOKEN` | Access token for Bsale demo API | `your-token-here` |
| `BSALE_API_BASE_URL` | Base URL for Bsale API | `https://api.bsale.io` |

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

**Issue:** Missing secrets
**Solution:** Ensure `BSALE_ACCESS_TOKEN` and `BSALE_API_BASE_URL` are configured in GitHub Secrets.

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

## Future Improvements

- [ ] Add performance benchmarking
- [ ] Add security scanning (Dependabot, CodeQL)
- [ ] Add deployment workflows
- [ ] Add release automation
- [ ] Add changelog generation
