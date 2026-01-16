# Browser Testing Plan for AI SKU Alerts

## Overview

This document outlines the strategy for implementing end-to-end browser testing using **Playwright** to verify user journeys in the AI SKU Alerts application.

**Current State:** The application has 528+ unit tests and API integration tests, but no browser automation tests.

**Goal:** Establish browser E2E testing to validate critical user flows from signup through daily usage.

---

## Technology Choice: Playwright

| Criteria | Playwright | Cypress |
|----------|------------|---------|
| Bun Compatibility | Native support | Requires Node |
| Multi-browser | Chromium, Firefox, WebKit | Chromium only (free) |
| Parallel execution | Built-in | Requires paid tier |
| Mobile viewports | Built-in | Plugin needed |
| Network mocking | Excellent | Good |
| Speed | Faster | Slower |

**Recommendation:** Playwright - better Bun support, faster, and free multi-browser testing.

---

## Installation

```bash
# Install Playwright with Bun
bun add -D @playwright/test

# Install browsers
bunx playwright install chromium

# Optional: Install all browsers
bunx playwright install
```

---

## Directory Structure

```
tests/
├── e2e/                          # Browser E2E tests
│   ├── fixtures/
│   │   ├── auth.fixture.ts       # Auth helpers (magic link, session)
│   │   ├── database.fixture.ts   # Test data setup/teardown
│   │   └── test-users.ts         # Test user credentials
│   ├── pages/                    # Page Object Models
│   │   ├── landing.page.ts
│   │   ├── login.page.ts
│   │   ├── dashboard.page.ts
│   │   ├── alerts.page.ts
│   │   ├── products.page.ts
│   │   ├── thresholds.page.ts
│   │   └── settings.page.ts
│   ├── journeys/                 # User journey tests
│   │   ├── 01-authentication.spec.ts
│   │   ├── 02-onboarding.spec.ts
│   │   ├── 03-threshold-management.spec.ts
│   │   ├── 04-alert-workflow.spec.ts
│   │   └── 05-settings.spec.ts
│   └── playwright.config.ts
├── integration/                   # Existing API tests
└── unit/                          # Existing unit tests
```

---

## User Journeys to Test

### Journey 1: New User Authentication

**Priority: Critical**

```
Landing Page → Login → Magic Link Request → Email Verification → Dashboard
```

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Visit `/` | Landing page loads, CTA visible |
| 2 | Click "Get Started" | Navigate to `/login` |
| 3 | Enter email | Email input accepts valid format |
| 4 | Submit magic link request | Success message, rate limit shown |
| 5 | Verify magic link token | Redirect to `/app`, session created |
| 6 | Check dashboard | User sees empty state, connect Bsale prompt |

**Test Cases:**
- [ ] Valid email receives magic link
- [ ] Invalid email shows validation error
- [ ] Rate limiting (5 requests/hour) enforced
- [ ] Expired token shows error message
- [ ] Already used token shows error message

---

### Journey 2: Bsale OAuth Connection

**Priority: Critical**

```
Dashboard → Connect Bsale → OAuth Flow → Callback → Initial Sync → Dashboard with Data
```

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Connect Bsale" | Redirect to Bsale OAuth |
| 2 | Authorize in Bsale | Return to callback URL |
| 3 | Callback processed | Token stored, sync initiated |
| 4 | Wait for sync | Progress indicator shown |
| 5 | Sync complete | Dashboard shows product count |

**Test Cases:**
- [ ] OAuth redirect includes correct scopes
- [ ] PKCE challenge/verifier works
- [ ] CSRF state validated on callback
- [ ] OAuth error (denied) handled gracefully
- [ ] Duplicate connection prevented

**Note:** This journey requires mocking Bsale OAuth or using a test Bsale account.

---

### Journey 3: Threshold Management

**Priority: High**

```
Dashboard → Thresholds → Create Threshold → Edit Threshold → Delete Threshold
```

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/app/thresholds` | Threshold list loads |
| 2 | Click "Add Threshold" | Form modal opens |
| 3 | Select product/variant | Product picker works |
| 4 | Enter minimum quantity | Number validation |
| 5 | Select locations | Multi-select works |
| 6 | Save threshold | New threshold in list |
| 7 | Edit threshold | Form pre-filled |
| 8 | Update quantity | Changes saved |
| 9 | Delete threshold | Confirmation, removed from list |

**Test Cases:**
- [ ] Create threshold with single location
- [ ] Create threshold with multiple locations
- [ ] Create threshold for all locations (wildcard)
- [ ] Edit existing threshold
- [ ] Delete threshold with confirmation
- [ ] Duplicate threshold prevention
- [ ] Validation: quantity must be positive

---

### Journey 4: Alert Workflow

**Priority: High**

```
Alerts Page → View Alert Details → Dismiss Alert → Filter Alerts
```

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/app/alerts` | Alert list loads |
| 2 | View alert card | Shows product, location, stock level |
| 3 | Click alert for details | Expanded view or modal |
| 4 | Dismiss alert | Removed from active list |
| 5 | Filter by location | List updates |
| 6 | Filter by severity | Critical/warning filter works |
| 7 | Check empty state | Proper message when no alerts |

**Test Cases:**
- [ ] Alert list pagination
- [ ] Alert severity badges (critical, warning)
- [ ] Dismiss single alert
- [ ] Dismiss multiple alerts
- [ ] Filter by location
- [ ] Filter by status (active/dismissed)
- [ ] Empty state messaging

---

### Journey 5: Product Browsing

**Priority: Medium**

```
Dashboard → Products → Search → View Product → Check Stock Levels
```

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/app/products` | Product grid loads |
| 2 | Search by name | Results filter |
| 3 | Search by SKU | Exact match found |
| 4 | Click product | Details page opens |
| 5 | View stock by location | Location breakdown visible |
| 6 | Check threshold status | Threshold indicator shown |

**Test Cases:**
- [ ] Product list loads with pagination
- [ ] Search by product name
- [ ] Search by SKU
- [ ] Filter by category (if available)
- [ ] Product detail view
- [ ] Stock level by location display

---

### Journey 6: Settings & Preferences

**Priority: Medium**

```
Dashboard → Settings → Update Preferences → Save → Verify Persistence
```

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/app/settings` | Settings page loads |
| 2 | Toggle email notifications | Switch updates |
| 3 | Change notification frequency | Dropdown works |
| 4 | Update timezone | Selection saved |
| 5 | Save settings | Success message |
| 6 | Refresh page | Settings persisted |
| 7 | Logout and login | Settings still there |

**Test Cases:**
- [ ] Email notification toggle
- [ ] Notification frequency selection
- [ ] Timezone selection
- [ ] Settings persist after logout
- [ ] Bsale disconnect confirmation

---

### Journey 7: Billing & Subscription (if enabled)

**Priority: Low (Phase 2)**

```
Settings → Upgrade → Checkout → Payment → Confirmation
```

**Note:** Requires MercadoPago sandbox integration.

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. **Setup Playwright**
   - Install dependencies
   - Configure `playwright.config.ts`
   - Create base fixtures

2. **Page Object Models**
   - Create POMs for all pages
   - Define common selectors
   - Add helper methods

3. **Test Database Setup**
   - Create test tenant seeding
   - Add cleanup hooks
   - Configure test isolation

### Phase 2: Critical Paths (Week 2)

4. **Authentication Tests**
   - Magic link flow (mock email)
   - Session persistence
   - Logout flow
   - Protected route redirects

5. **Core Feature Tests**
   - Dashboard loads
   - Threshold CRUD
   - Alert viewing

### Phase 3: Full Coverage (Week 3)

6. **All User Journeys**
   - Complete remaining journeys
   - Edge cases
   - Error states

7. **CI Integration**
   - Add to GitHub Actions
   - Parallel execution
   - Screenshot on failure

---

## Configuration

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/journeys',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

---

## Example Test: Authentication Journey

```typescript
// tests/e2e/journeys/01-authentication.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';
import { createTestMagicLink } from '../fixtures/auth.fixture';

test.describe('Authentication Journey', () => {
  test('new user can request and use magic link', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);
    const testEmail = `test-${Date.now()}@example.com`;

    // Step 1: Visit login page
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();

    // Step 2: Request magic link
    await loginPage.requestMagicLink(testEmail);
    await expect(loginPage.successMessage).toContainText('Check your email');

    // Step 3: Simulate clicking magic link (bypass email)
    const magicLink = await createTestMagicLink(testEmail);
    await page.goto(magicLink);

    // Step 4: Verify redirect to dashboard
    await expect(page).toHaveURL(/\/app$/);
    await expect(dashboardPage.welcomeMessage).toBeVisible();
  });

  test('invalid email shows validation error', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.emailInput.fill('not-an-email');
    await loginPage.submitButton.click();

    await expect(loginPage.errorMessage).toContainText('valid email');
  });

  test('protected routes redirect to login', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
  });

  test('authenticated user stays logged in', async ({ page, context }) => {
    // Use stored auth state
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);
  });
});
```

---

## Example Page Object Model

```typescript
// tests/e2e/pages/login.page.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly bsaleOAuthButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.submitButton = page.getByRole('button', { name: /send.*link/i });
    this.successMessage = page.getByRole('alert').filter({ hasText: /check.*email/i });
    this.errorMessage = page.getByRole('alert').filter({ hasText: /error/i });
    this.bsaleOAuthButton = page.getByRole('button', { name: /connect.*bsale/i });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async requestMagicLink(email: string) {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }

  async connectWithBsale() {
    await this.bsaleOAuthButton.click();
  }
}
```

---

## Test Data Strategy

### Option A: Database Seeding (Recommended)

```typescript
// tests/e2e/fixtures/database.fixture.ts
import { sql } from '../../src/db/client';

export async function seedTestTenant() {
  const tenant = await sql`
    INSERT INTO tenants (name, email, country_code)
    VALUES ('Test Tenant', 'test@example.com', 'CL')
    RETURNING *
  `;

  const user = await sql`
    INSERT INTO users (tenant_id, email, role)
    VALUES (${tenant[0].id}, 'test@example.com', 'admin')
    RETURNING *
  `;

  return { tenant: tenant[0], user: user[0] };
}

export async function cleanupTestData(tenantId: string) {
  await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
}
```

### Option B: API Mocking

```typescript
// For testing without a real database
await page.route('/api/**', async (route) => {
  if (route.request().url().includes('/api/auth/me')) {
    await route.fulfill({
      json: { user: { id: '1', email: 'test@example.com' } }
    });
  } else {
    await route.continue();
  }
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/e2e-browser.yml
name: Browser E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: aiskualerts_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Run migrations
        run: bun run db:migrate
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/aiskualerts_test

      - name: Run E2E tests
        run: bunx playwright test
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/aiskualerts_test
          BASE_URL: http://localhost:3000

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

---

## Running Tests Locally

```bash
# Run all browser tests
bunx playwright test

# Run specific journey
bunx playwright test tests/e2e/journeys/01-authentication.spec.ts

# Run with UI mode (interactive)
bunx playwright test --ui

# Run in headed mode (see browser)
bunx playwright test --headed

# Generate report
bunx playwright show-report
```

---

## Package.json Scripts

Add these to `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report"
  }
}
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Critical path coverage | 100% |
| All user journeys tested | 7/7 |
| Test execution time | < 5 min |
| Flaky test rate | < 5% |
| CI integration | Passing on every PR |

---

## Next Steps

1. [ ] Install Playwright dependencies
2. [ ] Create `playwright.config.ts`
3. [ ] Set up Page Object Models
4. [ ] Implement authentication journey tests
5. [ ] Add to CI workflow
6. [ ] Document in `docs/TESTING.md`

---

## References

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
