# Testing Guide

## Test Structure

### Unit Tests
- **Location:** `tests/**/*.test.ts`
- **Purpose:** Test individual components with mocked dependencies
- **Speed:** Fast (~12 seconds)
- **Coverage:** 100% line coverage required
- **Secrets:** None required

### Integration Tests (E2E)
- **Location:** `tests/**/*.integration.test.ts`
- **Purpose:** Test against real Bsale demo API
- **Speed:** Slower (~32 seconds)
- **Requirements:** 1Password CLI with access to Dev vault
- **Secrets:** Auto-loaded from 1Password (no setup needed!)

## Running Tests

### Quick Start
```bash
# Run unit tests (default, fast)
bun test

# Run integration tests (requires .env)
bun run test:integration

# Run all tests
bun run test:all
```

### All Commands

```bash
# Unit tests only (fast, CI-ready)
bun test
bun run test:unit

# Integration/E2E tests (requires API access)
bun run test:integration
bun run test:e2e

# All tests (unit + integration)
bun run test:all

# Unit tests with coverage report
bun run test:coverage

# Full quality check (lint + typecheck + test)
bun run check
```

## Test Files

### `tests/bsale/client.test.ts` (Unit Tests)
- 16 tests, 28 assertions
- Mocked fetch responses
- Tests all error paths and edge cases
- 100% code coverage

**What's tested:**
- Constructor initialization (all country codes)
- Stock pagination logic
- Variant fetching
- Error handling (401, 429, 4xx, 5xx)
- Retry logic with exponential backoff
- Rate limiting delays
- Null field handling

### `tests/bsale/client.integration.test.ts` (E2E)
- 10 tests, 118 assertions
- Real Bsale demo API
- Validates production behavior
- Custom timeouts for slow API calls

**What's tested:**
- Real API connectivity
- Live stock data fetching
- Pagination across multiple pages
- Variant detail retrieval
- Null/optional field handling in real data
- Invalid token errors
- Rate limiting with live requests
- Schema validation with Zod

## Environment Setup

### Prerequisites

1. **Install 1Password CLI:**
   ```bash
   brew install 1password-cli
   ```

2. **Sign in to 1Password:**
   ```bash
   op signin
   ```

That's it! Secrets are automatically loaded from 1Password when running integration tests.

### How It Works

```bash
# When you run:
bun run test:integration

# Behind the scenes:
op run --env-file=.env.tpl -- bun test tests/**/*.integration.test.ts
  ↓
  Reads .env.tpl (1Password secret references)
  ↓
  Fetches secrets from 1Password Dev vault
  ↓
  Injects into environment (memory only, never on disk)
  ↓
  Runs tests
  ↓
  Secrets cleared when process exits
```

### Verify Setup

```bash
# Check 1Password CLI is installed
op --version

# Verify secret access
op run --env-file=.env.tpl -- env | grep BSALE

# Run integration tests
bun run test:integration
```

## CI/CD Integration

### GitHub Actions Example
```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1

      # Run fast unit tests
      - run: bun install
      - run: bun run check

      # Optional: Run E2E tests (requires secrets)
      # - run: bun run test:integration
      #   env:
      #     BSALE_ACCESS_TOKEN: ${{ secrets.BSALE_ACCESS_TOKEN }}
      #     BSALE_API_BASE_URL: ${{ secrets.BSALE_API_BASE_URL }}
```

## Test Naming Convention

- **Unit tests:** `*.test.ts` (e.g., `client.test.ts`)
- **Integration tests:** `*.integration.test.ts` (e.g., `client.integration.test.ts`)

This naming allows us to selectively run test types:
- Unit: Fast, no external dependencies
- Integration: Slower, requires real API

## Coverage Reports

```bash
bun run test:coverage
```

**Output:**
```
---------------------|---------|---------|-------------------
File                 | % Funcs | % Lines | Uncovered Line #s
---------------------|---------|---------|-------------------
All files            |  100.00 |  100.00 |
 src/bsale/client.ts |  100.00 |  100.00 |
 src/lib/errors.ts   |  100.00 |  100.00 |
---------------------|---------|---------|-------------------
```

## Troubleshooting

### E2E Tests Failing
**Error:** `BSALE_ACCESS_TOKEN must be set`
**Solution:**
1. Ensure 1Password CLI is installed: `brew install 1password-cli`
2. Sign in: `op signin`
3. Verify access: `op run --env-file=.env.tpl -- env | grep BSALE`

**Error:** `op: command not found`
**Solution:** Install 1Password CLI: `brew install 1password-cli`

**Error:** `authentication required`
**Solution:** Sign in to 1Password: `op signin`

**Error:** Tests timeout
**Solution:** Check network connection to `api.bsale.io`

**Error:** `BsaleAuthError`
**Solution:** Verify the secret in 1Password is correct:
```bash
op item get "BSALE_DEMO_ACCESS_TOKEN" --vault Dev
```

### Coverage Below 100%
**Error:** `Coverage threshold not met`
**Solution:** Add tests for uncovered lines (see coverage report)

## Best Practices

### Writing Unit Tests
- ✅ Mock all external dependencies (fetch)
- ✅ Test both success and error paths
- ✅ Keep tests fast (< 100ms per test)
- ✅ Use descriptive test names

### Writing Integration Tests
- ✅ Test against real API
- ✅ Handle slow responses (use custom timeouts)
- ✅ Fetch limited data (don't exhaust API)
- ✅ Verify real-world edge cases

### When to Run Each
| Test Type | When to Run |
|-----------|-------------|
| Unit | Every commit, pre-push, CI/CD |
| Integration | Before deployment, nightly builds |
| All | Before releasing, major changes |

## Security

### No Secrets on Disk ✅

This project uses **1Password CLI** for secret management:
- Secrets are **never stored on disk** in plaintext
- `.env.tpl` contains 1Password references (safe to commit)
- `op run` fetches secrets at runtime (memory only)
- Secrets cleared automatically when process exits

See [SECRETS.md](SECRETS.md) for full documentation.

## Future Improvements

- [x] 1Password CLI integration for secure credentials
- [ ] Nightly E2E test runs in CI
- [ ] Performance benchmarking
- [ ] More endpoint coverage (when needed)
- [ ] Test data fixtures for consistent results
