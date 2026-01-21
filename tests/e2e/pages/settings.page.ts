import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for the Settings page (/app/settings)
 * Handles Bsale connection, notifications, and billing
 */
export class SettingsPage {
  readonly page: Page;

  // Connection status
  readonly connectionCard: Locator;
  readonly syncStatus: Locator;
  readonly connectedTenant: Locator;

  // Connect Bsale form (when not connected)
  readonly connectForm: Locator;
  readonly clientCodeInput: Locator;
  readonly connectButton: Locator;

  // Add account (when already connected)
  readonly addAccountButton: Locator;
  readonly addAccountForm: Locator;
  readonly addAccountClientCodeInput: Locator;
  readonly addAccountSubmitButton: Locator;

  // Manual sync
  readonly syncNowButton: Locator;

  // Notifications
  readonly notificationToggle: Locator;
  readonly frequencySelect: Locator;

  // Billing / Plan
  readonly currentPlan: Locator;
  readonly upgradeButton: Locator;
  readonly upgradeConfirmModal: Locator;
  readonly confirmUpgradeButton: Locator;

  // Usage meter
  readonly usageMeter: Locator;
  readonly usageText: Locator;

  // Messages
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Connection status
    this.connectionCard = page.locator('[data-testid="connection-card"]');
    this.syncStatus = page.locator('[data-testid="sync-status"]');
    this.connectedTenant = page.locator('[data-testid="connected-tenant"]');

    // Connect Bsale form
    this.connectForm = page.locator('[data-testid="connect-form"]');
    this.clientCodeInput = page.locator('input[placeholder*="Codigo"]');
    this.connectButton = page.locator('button:has-text("Conectar con Bsale")');

    // Add account
    this.addAccountButton = page.locator('button:has-text("Agregar cuenta Bsale")');
    this.addAccountForm = page.locator('[data-testid="add-account-form"]');
    this.addAccountClientCodeInput = page.locator('[data-testid="add-account-code"]');
    this.addAccountSubmitButton = page.locator('[data-testid="add-account-submit"]');

    // Manual sync
    this.syncNowButton = page.locator('button:has-text("Sincronizar ahora")');

    // Notifications
    this.notificationToggle = page.locator('[data-testid="notification-toggle"]');
    this.frequencySelect = page.locator('select[name="frequency"]');

    // Billing
    this.currentPlan = page.locator('[data-testid="current-plan"]');
    this.upgradeButton = page.locator('button:has-text("Actualizar a Pro")');
    this.upgradeConfirmModal = page.locator('[data-testid="upgrade-confirm-modal"]');
    this.confirmUpgradeButton = page.locator('button:has-text("Confirmar")');

    // Usage meter
    this.usageMeter = page.locator('[data-testid="usage-meter"]');
    this.usageText = page.locator('[data-testid="usage-text"]');

    // Messages
    this.successMessage = page.locator('[style*="background-color: rgb(220, 252, 231)"]');
    this.errorMessage = page.locator('[style*="background-color: rgb(254, 226, 226)"]');
  }

  /**
   * Navigate to the settings page
   */
  async goto(): Promise<void> {
    await this.page.goto("/app/settings");
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Wait for the page to load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector(".card", { state: "visible" });
  }

  /**
   * Check if Bsale is connected
   */
  async isBsaleConnected(): Promise<boolean> {
    // If we can see "Add account" button, we're connected
    const addAccountVisible = await this.addAccountButton.isVisible();
    const connectVisible = await this.connectButton.isVisible();
    return addAccountVisible || !connectVisible;
  }

  /**
   * Connect to Bsale (initial connection)
   */
  async connectBsale(clientCode: string): Promise<void> {
    await this.clientCodeInput.fill(clientCode);
    await this.connectButton.click();
  }

  /**
   * Add another Bsale account (when already connected)
   */
  async addBsaleAccount(clientCode: string): Promise<void> {
    await this.addAccountButton.click();

    // Fill in the form - may be inline or in modal
    const codeInputVisible = await this.addAccountClientCodeInput.isVisible();
    const codeInput = codeInputVisible
      ? this.addAccountClientCodeInput
      : this.clientCodeInput;

    await codeInput.fill(clientCode);

    // Submit - may be a dedicated button or the connect button
    const submitBtnVisible = await this.addAccountSubmitButton.isVisible();
    const submitBtn = submitBtnVisible
      ? this.addAccountSubmitButton
      : this.connectButton;

    await submitBtn.click();
  }

  /**
   * Trigger manual sync
   */
  async syncNow(): Promise<void> {
    await this.syncNowButton.click();
  }

  /**
   * Get current sync status text
   */
  async getSyncStatusText(): Promise<string> {
    return (await this.syncStatus.textContent()) ?? "";
  }

  /**
   * Toggle email notifications
   */
  async toggleNotifications(): Promise<void> {
    await this.notificationToggle.click();
  }

  /**
   * Set notification frequency
   */
  async setFrequency(frequency: "immediate" | "daily" | "weekly"): Promise<void> {
    await this.frequencySelect.selectOption(frequency);
  }

  /**
   * Get current plan name
   */
  async getCurrentPlan(): Promise<string> {
    return (await this.currentPlan.textContent()) ?? "";
  }

  /**
   * Click upgrade to pro
   */
  async clickUpgrade(): Promise<void> {
    await this.upgradeButton.click();
  }

  /**
   * Confirm upgrade in modal
   */
  async confirmUpgrade(): Promise<void> {
    await this.confirmUpgradeButton.click();
  }

  /**
   * Full upgrade flow
   */
  async upgradeToPro(): Promise<void> {
    await this.clickUpgrade();
    // Wait for confirmation modal or redirect
    const confirmVisible = await this.upgradeConfirmModal.isVisible().catch(() => false);
    if (confirmVisible) {
      await this.confirmUpgrade();
    }
  }

  /**
   * Check if upgrade button is visible
   */
  async canUpgrade(): Promise<boolean> {
    return await this.upgradeButton.isVisible();
  }

  /**
   * Get usage meter text
   */
  async getUsageText(): Promise<string> {
    return (await this.usageText.textContent()) ?? "";
  }

  /**
   * Check if success message is shown
   */
  async hasSuccessMessage(): Promise<boolean> {
    return await this.successMessage.isVisible();
  }

  /**
   * Check if error message is shown
   */
  async hasErrorMessage(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Wait for success message
   */
  async waitForSuccess(): Promise<void> {
    await this.successMessage.waitFor({ state: "visible", timeout: 5000 });
  }

  /**
   * Wait for error message
   */
  async waitForError(): Promise<void> {
    await this.errorMessage.waitFor({ state: "visible", timeout: 5000 });
  }
}
