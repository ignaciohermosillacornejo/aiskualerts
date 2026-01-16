import { test as base, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

/**
 * Resend test email addresses for different scenarios
 * @see https://resend.com/docs/dashboard/emails/send-test-emails
 */
export const RESEND_TEST_EMAILS = {
  /** Simulates successful email delivery */
  delivered: "delivered@resend.dev",
  /** Simulates email bounce (invalid recipient) */
  bounced: "bounced@resend.dev",
  /** Simulates spam complaint */
  complained: "complained@resend.dev",
} as const;

/**
 * Generate a unique test email with a label
 * Format: delivered+{label}@resend.dev
 */
export function generateTestEmail(label?: string): string {
  const uniqueLabel = label ?? `e2e-${Date.now()}-${randomBytes(4).toString("hex")}`;
  return `delivered+${uniqueLabel}@resend.dev`;
}

/**
 * Generate a cryptographically secure token for testing
 */
export function generateTestToken(): string {
  return randomBytes(32).toString("hex");
}

export interface AuthFixture {
  /**
   * Create a magic link token directly via API
   * This bypasses email sending for faster tests
   */
  createMagicLinkToken: (email: string) => Promise<string>;

  /**
   * Get the magic link verification URL for a token
   */
  getMagicLinkUrl: (token: string) => string;

  /**
   * Authenticate via magic link and return to page
   * Complete flow: request magic link -> create token -> verify -> session
   */
  authenticateWithMagicLink: (email: string) => Promise<void>;

  /**
   * Check if the current page is authenticated
   */
  isAuthenticated: () => Promise<boolean>;

  /**
   * Generate a unique test email
   */
  generateTestEmail: (label?: string) => string;
}

/**
 * Extended test fixture with authentication helpers
 */
export const test = base.extend<{ auth: AuthFixture }>({
  auth: async ({ page, baseURL }, use) => {
    const auth: AuthFixture = {
      async createMagicLinkToken(email: string): Promise<string> {
        // First, request the magic link via API (this creates the token)
        const response = await page.request.post(`${baseURL}/api/auth/magic-link`, {
          data: { email },
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok()) {
          throw new Error(`Failed to request magic link: ${response.status()}`);
        }

        // For e2e tests, we need to get the token from the database
        // Since we can't access the DB directly from Playwright,
        // we'll use a test endpoint that returns the token (only in test mode)
        const tokenResponse = await page.request.get(
          `${baseURL}/api/test/magic-link-token?email=${encodeURIComponent(email)}`
        );

        if (!tokenResponse.ok()) {
          // Fallback: If test endpoint doesn't exist, the token was sent via email
          // In this case, tests must use the email inbox or mock the flow
          throw new Error(
            "Test endpoint /api/test/magic-link-token not available. " +
              "Ensure TEST_MODE=true is set or use email mocking."
          );
        }

        const { token } = (await tokenResponse.json()) as { token: string };
        return token;
      },

      getMagicLinkUrl(token: string): string {
        return `${baseURL}/api/auth/magic-link/verify?token=${token}`;
      },

      async authenticateWithMagicLink(email: string): Promise<void> {
        const token = await auth.createMagicLinkToken(email);
        const verifyUrl = auth.getMagicLinkUrl(token);
        await page.goto(verifyUrl);
        // Wait for redirect to complete
        await page.waitForURL(/\/app/);
      },

      async isAuthenticated(): Promise<boolean> {
        const response = await page.request.get(`${baseURL}/api/auth/me`);
        return response.ok();
      },

      generateTestEmail(label?: string): string {
        return generateTestEmail(label);
      },
    };

    await use(auth);
  },
});

export { expect } from "@playwright/test";

/**
 * Helper to set up authenticated state for tests that need a logged-in user
 * Use in test.beforeEach() for tests that require authentication
 */
export async function setupAuthenticatedSession(
  page: Page,
  baseURL: string,
  email: string = generateTestEmail()
): Promise<{ email: string }> {
  // Request magic link
  await page.request.post(`${baseURL}/api/auth/magic-link`, {
    data: { email },
    headers: { "Content-Type": "application/json" },
  });

  // Get token from test endpoint
  const tokenResponse = await page.request.get(
    `${baseURL}/api/test/magic-link-token?email=${encodeURIComponent(email)}`
  );

  if (tokenResponse.ok()) {
    const { token } = (await tokenResponse.json()) as { token: string };
    // Verify the magic link to create session
    await page.goto(`${baseURL}/api/auth/magic-link/verify?token=${token}`);
    await page.waitForURL(/\/app/);
  }

  return { email };
}
