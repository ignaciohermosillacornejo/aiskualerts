import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for the Login page (/login)
 * Handles magic link authentication flow
 */
export class LoginPage {
  readonly page: Page;

  // Main elements
  readonly heading: Locator;
  readonly subheading: Locator;

  // Form elements
  readonly emailInput: Locator;
  readonly submitButton: Locator;

  // Messages
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly successHeading: Locator;
  readonly successEmailDisplay: Locator;
  readonly expiryNotice: Locator;

  // Actions
  readonly useAnotherEmailButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main elements
    this.heading = page.locator("h1", { hasText: "AISku Alerts" });
    this.subheading = page.locator("text=Sistema de alertas de inventario para Bsale");

    // Form elements - using Spanish labels
    this.emailInput = page.locator('input[type="email"]');
    this.submitButton = page.locator('button[type="submit"]');

    // Error message
    this.errorMessage = page.locator('[data-testid="error-message"]');

    // Success state elements
    this.successMessage = page.locator('[data-testid="success-message"]');
    this.successHeading = page.locator("h2", { hasText: "Revisa tu correo" });
    this.successEmailDisplay = page.locator("strong");
    this.expiryNotice = page.locator("text=El enlace expira en 15 minutos");

    // Use another email button
    this.useAnotherEmailButton = page.locator("button", { hasText: "Usar otro correo" });
  }

  /**
   * Navigate to the login page
   */
  async goto(): Promise<void> {
    await this.page.goto("/login");
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Fill in the email and submit the magic link request
   */
  async requestMagicLink(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }

  /**
   * Wait for the success state after requesting magic link
   */
  async waitForSuccessState(): Promise<void> {
    await this.successHeading.waitFor({ state: "visible" });
  }

  /**
   * Wait for an error message to appear
   */
  async waitForError(): Promise<void> {
    await this.errorMessage.waitFor({ state: "visible" });
  }

  /**
   * Get the displayed error text
   */
  async getErrorText(): Promise<string> {
    return (await this.errorMessage.textContent()) ?? "";
  }

  /**
   * Check if the login form is visible (not success state)
   */
  async isFormVisible(): Promise<boolean> {
    return await this.emailInput.isVisible();
  }

  /**
   * Check if success state is displayed
   */
  async isSuccessStateVisible(): Promise<boolean> {
    return await this.successHeading.isVisible();
  }

  /**
   * Click to use another email (from success state)
   */
  async clickUseAnotherEmail(): Promise<void> {
    await this.useAnotherEmailButton.click();
  }

  /**
   * Get the email displayed in the success message
   */
  async getConfirmedEmail(): Promise<string> {
    return (await this.successEmailDisplay.textContent()) ?? "";
  }
}
