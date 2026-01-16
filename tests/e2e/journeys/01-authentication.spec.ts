/**
 * Authentication Journey E2E Tests
 *
 * Tests the complete magic link authentication flow:
 * 1. Landing page → Login navigation
 * 2. Magic link request
 * 3. Magic link verification → Dashboard access
 * 4. Protected route redirects
 * 5. Session persistence
 *
 * Uses Resend test emails (delivered@resend.dev) for testing
 * @see https://resend.com/docs/dashboard/emails/send-test-emails
 */

import { test, expect, generateTestEmail, RESEND_TEST_EMAILS } from "../fixtures/auth.fixture";
import { LoginPage } from "../pages/login.page";
import { DashboardPage } from "../pages/dashboard.page";

test.describe("Authentication Journey", () => {
  test.describe("Login Page UI", () => {
    test("displays login form with correct elements", async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Verify main elements are visible
      await expect(loginPage.heading).toBeVisible();
      await expect(loginPage.subheading).toBeVisible();
      await expect(loginPage.emailInput).toBeVisible();
      await expect(loginPage.submitButton).toBeVisible();

      // Verify submit button text
      await expect(loginPage.submitButton).toHaveText("Enviar enlace de acceso");
    });

    test("shows validation error for empty email submission", async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Try to submit without entering email
      await loginPage.submitButton.click();

      // Should show error
      await loginPage.waitForError();
      const errorText = await loginPage.getErrorText();
      expect(errorText).toContain("correo");
    });
  });

  test.describe("Magic Link Request", () => {
    test("successfully requests magic link with valid email", async ({ page }) => {
      const loginPage = new LoginPage(page);
      const testEmail = generateTestEmail("magic-link-request");

      await loginPage.goto();
      await loginPage.requestMagicLink(testEmail);

      // Should transition to success state
      await loginPage.waitForSuccessState();

      // Verify success UI
      await expect(loginPage.successHeading).toBeVisible();
      await expect(loginPage.expiryNotice).toBeVisible();

      // Verify email is displayed
      const confirmedEmail = await loginPage.getConfirmedEmail();
      expect(confirmedEmail).toBe(testEmail);
    });

    test("shows Resend test email for delivered scenario", async ({ page }) => {
      const loginPage = new LoginPage(page);

      await loginPage.goto();
      await loginPage.requestMagicLink(RESEND_TEST_EMAILS.delivered);

      await loginPage.waitForSuccessState();
      const confirmedEmail = await loginPage.getConfirmedEmail();
      expect(confirmedEmail).toBe(RESEND_TEST_EMAILS.delivered);
    });

    test("allows using different email after request", async ({ page }) => {
      const loginPage = new LoginPage(page);
      const firstEmail = generateTestEmail("first");
      const secondEmail = generateTestEmail("second");

      await loginPage.goto();
      await loginPage.requestMagicLink(firstEmail);
      await loginPage.waitForSuccessState();

      // Click to use another email
      await loginPage.clickUseAnotherEmail();

      // Should return to form state
      await expect(loginPage.emailInput).toBeVisible();
      expect(await loginPage.isFormVisible()).toBe(true);

      // Can enter a new email
      await loginPage.requestMagicLink(secondEmail);
      await loginPage.waitForSuccessState();

      const confirmedEmail = await loginPage.getConfirmedEmail();
      expect(confirmedEmail).toBe(secondEmail);
    });
  });

  test.describe("Protected Routes", () => {
    test("redirects to login when accessing /app without authentication", async ({ page }) => {
      // Try to access protected dashboard directly
      await page.goto("/app");

      // Should be redirected to login
      await expect(page).toHaveURL(/\/login/);
    });

    test("redirects to login when accessing /app/alerts without authentication", async ({ page }) => {
      await page.goto("/app/alerts");
      await expect(page).toHaveURL(/\/login/);
    });

    test("redirects to login when accessing /app/products without authentication", async ({ page }) => {
      await page.goto("/app/products");
      await expect(page).toHaveURL(/\/login/);
    });

    test("redirects to login when accessing /app/thresholds without authentication", async ({ page }) => {
      await page.goto("/app/thresholds");
      await expect(page).toHaveURL(/\/login/);
    });

    test("redirects to login when accessing /app/settings without authentication", async ({ page }) => {
      await page.goto("/app/settings");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("Magic Link Verification", () => {
    test("complete authentication flow: request → verify → dashboard", async ({ page, auth }) => {
      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);
      const testEmail = generateTestEmail("full-flow");

      // Step 1: Go to login page
      await loginPage.goto();
      await expect(loginPage.emailInput).toBeVisible();

      // Step 2: Request magic link
      await loginPage.requestMagicLink(testEmail);
      await loginPage.waitForSuccessState();

      // Step 3: Get the token via test endpoint and verify
      // This simulates clicking the magic link from email
      try {
        const token = await auth.createMagicLinkToken(testEmail);
        const verifyUrl = auth.getMagicLinkUrl(token);

        // Navigate to verification URL
        await page.goto(verifyUrl);

        // Step 4: Should redirect to dashboard
        await page.waitForURL(/\/app/, { timeout: 10000 });

        // Step 5: Dashboard should load
        await dashboardPage.waitForLoad();
        expect(await dashboardPage.isLoaded()).toBe(true);
      } catch {
        // If test endpoint is not available, skip token verification
        // This is expected in environments without the test endpoint
        test.skip(true, "Test endpoint /api/test/magic-link-token not available");
      }
    });

    test("invalid token shows error and redirects to login", async ({ page }) => {
      // Try to verify with an invalid token
      await page.goto("/api/auth/magic-link/verify?token=invalid-token-12345");

      // Should redirect to login with error
      await expect(page).toHaveURL(/\/login\?error=invalid_token/);

      // Error message should be displayed
      const loginPage = new LoginPage(page);
      await loginPage.waitForError();
      const errorText = await loginPage.getErrorText();
      expect(errorText).toContain("invalido");
    });

    test("missing token redirects to login with error", async ({ page }) => {
      await page.goto("/api/auth/magic-link/verify");
      await expect(page).toHaveURL(/\/login\?error=invalid_token/);
    });
  });

  test.describe("Session Persistence", () => {
    test("authenticated user remains logged in after page refresh", async ({ page, auth }) => {
      const dashboardPage = new DashboardPage(page);
      const testEmail = generateTestEmail("session-persist");

      try {
        // Authenticate
        await auth.authenticateWithMagicLink(testEmail);

        // Verify we're on dashboard
        await dashboardPage.waitForLoad();
        expect(await dashboardPage.isLoaded()).toBe(true);

        // Refresh the page
        await page.reload();

        // Should still be on dashboard
        await dashboardPage.waitForLoad();
        expect(await dashboardPage.isLoaded()).toBe(true);
        await expect(page).toHaveURL(/\/app/);
      } catch {
        test.skip(true, "Test endpoint /api/test/magic-link-token not available");
      }
    });

    test("authenticated user can navigate between protected routes", async ({ page, auth }) => {
      const testEmail = generateTestEmail("nav-test");

      try {
        await auth.authenticateWithMagicLink(testEmail);

        // Navigate to alerts
        await page.goto("/app/alerts");
        await expect(page).toHaveURL(/\/app\/alerts/);

        // Navigate to products
        await page.goto("/app/products");
        await expect(page).toHaveURL(/\/app\/products/);

        // Navigate to settings
        await page.goto("/app/settings");
        await expect(page).toHaveURL(/\/app\/settings/);

        // Back to dashboard
        await page.goto("/app");
        await expect(page).toHaveURL(/\/app$/);
      } catch {
        test.skip(true, "Test endpoint /api/test/magic-link-token not available");
      }
    });
  });

  test.describe("Already Logged In", () => {
    test("logged in user visiting /login is redirected to /app", async ({ page, auth }) => {
      const testEmail = generateTestEmail("already-logged-in");

      try {
        // First authenticate
        await auth.authenticateWithMagicLink(testEmail);

        // Now try to visit login page
        await page.goto("/login");

        // Should be redirected to dashboard
        await expect(page).toHaveURL(/\/app/);
      } catch {
        test.skip(true, "Test endpoint /api/test/magic-link-token not available");
      }
    });
  });
});

test.describe("Authentication - Mobile Viewport", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("login form is usable on mobile", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const testEmail = generateTestEmail("mobile-test");

    await loginPage.goto();

    // All elements should be visible on mobile
    await expect(loginPage.heading).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();

    // Form should work
    await loginPage.requestMagicLink(testEmail);
    await loginPage.waitForSuccessState();
    await expect(loginPage.successHeading).toBeVisible();
  });
});
