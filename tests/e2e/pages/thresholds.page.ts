import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for the Thresholds page (/app/thresholds)
 * Handles threshold CRUD operations
 */
export class ThresholdsPage {
  readonly page: Page;

  // Header elements
  readonly pageTitle: Locator;
  readonly usageCounter: Locator;
  readonly addButton: Locator;

  // Limit banners
  readonly approachingLimitBanner: Locator;
  readonly overLimitBanner: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateTitle: Locator;
  readonly createFirstButton: Locator;

  // Table elements
  readonly table: Locator;
  readonly tableRows: Locator;

  // Modal elements
  readonly modal: Locator;
  readonly modalTitle: Locator;
  readonly minQuantityInput: Locator;
  readonly productSelect: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly modalLimitWarning: Locator;

  // Delete confirmation
  readonly deleteConfirmModal: Locator;
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header elements
    this.pageTitle = page.locator("h2", { hasText: "Umbrales" });
    this.usageCounter = page.locator('[data-testid="usage-counter"]');
    this.addButton = page.locator('button:has-text("Agregar umbral")');

    // Limit banners
    this.approachingLimitBanner = page.locator('[data-testid="approaching-limit-banner"]');
    this.overLimitBanner = page.locator('[data-testid="over-limit-banner"]');

    // Empty state
    this.emptyState = page.locator(".empty-state");
    this.emptyStateTitle = page.locator(".empty-state-title", { hasText: "Sin umbrales" });
    this.createFirstButton = page.locator('button:has-text("Crear primer umbral")');

    // Table elements
    this.table = page.locator(".table");
    this.tableRows = page.locator(".table tbody tr");

    // Modal elements
    this.modal = page.locator('[data-testid="threshold-modal"]');
    this.modalTitle = this.modal.locator("h2");
    this.minQuantityInput = page.locator('input[name="minQuantity"]');
    this.productSelect = page.locator('[data-testid="product-select"]');
    this.saveButton = page.locator('button:has-text("Guardar")');
    this.cancelButton = this.modal.locator('button:has-text("Cancelar")');
    this.modalLimitWarning = page.locator('[data-testid="limit-warning"]');

    // Delete confirmation
    this.deleteConfirmModal = page.locator('[data-testid="confirm-modal"]');
    this.confirmDeleteButton = page.locator('button:has-text("Eliminar")').last();
    this.cancelDeleteButton = this.deleteConfirmModal.locator('button:has-text("Cancelar")');
  }

  /**
   * Navigate to the thresholds page
   */
  async goto(): Promise<void> {
    await this.page.goto("/app/thresholds");
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Wait for the page to load (either empty state or table)
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector(".empty-state, .table", { state: "visible" });
  }

  /**
   * Check if the page shows empty state
   */
  async isEmptyState(): Promise<boolean> {
    return await this.emptyStateTitle.isVisible();
  }

  /**
   * Click add threshold button
   */
  async clickAddThreshold(): Promise<void> {
    // Use either the header button or empty state button
    const addBtn = await this.addButton.isVisible()
      ? this.addButton
      : this.createFirstButton;
    await addBtn.click();
  }

  /**
   * Create a new threshold
   */
  async createThreshold(data: {
    productName: string;
    minQuantity: number;
  }): Promise<void> {
    await this.clickAddThreshold();

    // Fill in the form
    await this.minQuantityInput.fill(String(data.minQuantity));

    // Select product
    await this.productSelect.click();
    await this.page.click(`text=${data.productName}`);

    // Save
    await this.saveButton.click();

    // Wait for modal to close
    await this.modal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {
      // Modal may already be hidden
    });
  }

  /**
   * Get the number of thresholds in the table
   */
  async getThresholdCount(): Promise<number> {
    if (await this.isEmptyState()) {
      return 0;
    }
    return await this.tableRows.count();
  }

  /**
   * Get threshold row by product name
   */
  getThresholdRow(productName: string): Locator {
    return this.tableRows.filter({ hasText: productName });
  }

  /**
   * Edit a threshold by product name
   */
  async editThreshold(productName: string): Promise<void> {
    const row = this.getThresholdRow(productName);
    await row.locator('button:has-text("Editar")').click();
  }

  /**
   * Delete a threshold by product name
   */
  async deleteThreshold(productName: string): Promise<void> {
    const row = this.getThresholdRow(productName);
    await row.locator('button:has-text("Eliminar")').click();

    // Confirm deletion
    await this.confirmDeleteButton.click();

    // Wait for row to be removed
    await row.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {
      // Row may already be removed
    });
  }

  /**
   * Get the usage text (e.g., "5 / 50")
   */
  async getUsageText(): Promise<string> {
    const text = await this.usageCounter.textContent();
    return text ?? "";
  }

  /**
   * Check if limit warning is shown in modal
   */
  async isLimitWarningVisible(): Promise<boolean> {
    return await this.modalLimitWarning.isVisible();
  }

  /**
   * Check if upgrade prompt is shown
   */
  async isUpgradePromptVisible(): Promise<boolean> {
    return await this.page.locator('text=Actualiza tu plan').isVisible();
  }
}
