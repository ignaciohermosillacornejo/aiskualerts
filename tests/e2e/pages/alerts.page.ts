import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for the Alerts page (/app/alerts)
 * Handles alert viewing, filtering, and dismissal
 */
export class AlertsPage {
  readonly page: Page;

  // View toggle
  readonly activeButton: Locator;
  readonly historyButton: Locator;

  // Filter buttons
  readonly filterAll: Locator;
  readonly filterThreshold: Locator;
  readonly filterVelocity: Locator;

  // Header
  readonly alertsTitle: Locator;
  readonly alertCount: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateTitle: Locator;

  // Table elements
  readonly table: Locator;
  readonly tableRows: Locator;

  constructor(page: Page) {
    this.page = page;

    // View toggle
    this.activeButton = page.locator('button:has-text("Activas")');
    this.historyButton = page.locator('button:has-text("Historial")');

    // Filter buttons
    this.filterAll = page.locator('button:has-text("Todas")');
    this.filterThreshold = page.locator('button:has-text("Umbral Excedido")');
    this.filterVelocity = page.locator('button:has-text("Baja Velocidad")');

    // Header
    this.alertsTitle = page.locator("h2.card-title", { hasText: "Alertas" });
    this.alertCount = page.locator("h2.card-title");

    // Empty state
    this.emptyState = page.locator(".empty-state");
    this.emptyStateTitle = page.locator(".empty-state-title");

    // Table elements
    this.table = page.locator(".table");
    this.tableRows = page.locator(".table tbody tr");
  }

  /**
   * Navigate to the alerts page
   */
  async goto(): Promise<void> {
    await this.page.goto("/app/alerts");
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Wait for the page to load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector(".empty-state, .table", { state: "visible" });
  }

  /**
   * Check if the page shows empty state
   */
  async isEmptyState(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Get the empty state message
   */
  async getEmptyStateMessage(): Promise<string> {
    return (await this.emptyStateTitle.textContent()) ?? "";
  }

  /**
   * Get the number of alerts displayed
   */
  async getAlertCount(): Promise<number> {
    if (await this.isEmptyState()) {
      return 0;
    }
    return await this.tableRows.count();
  }

  /**
   * Get alert row by product name
   */
  getAlertRow(productName: string): Locator {
    return this.tableRows.filter({ hasText: productName });
  }

  /**
   * Dismiss an alert by product name
   */
  async dismissAlert(productName: string): Promise<void> {
    const row = this.getAlertRow(productName);
    await row.locator('[data-testid="dismiss-alert"], button:has-text("Descartar")').click();

    // Wait for row to be removed
    await row.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {
      // Row may already be removed
    });
  }

  /**
   * Switch to active alerts view
   */
  async showActive(): Promise<void> {
    await this.activeButton.click();
    await this.waitForLoad();
  }

  /**
   * Switch to history view
   */
  async showHistory(): Promise<void> {
    await this.historyButton.click();
    await this.waitForLoad();
  }

  /**
   * Filter by all types
   */
  async filterByAll(): Promise<void> {
    await this.filterAll.click();
    await this.waitForLoad();
  }

  /**
   * Filter by threshold alerts
   */
  async filterByThreshold(): Promise<void> {
    await this.filterThreshold.click();
    await this.waitForLoad();
  }

  /**
   * Filter by velocity alerts
   */
  async filterByVelocity(): Promise<void> {
    await this.filterVelocity.click();
    await this.waitForLoad();
  }

  /**
   * Check if a specific alert exists
   */
  async hasAlert(productName: string): Promise<boolean> {
    return await this.getAlertRow(productName).isVisible();
  }

  /**
   * Get the alert type badge text for a product
   */
  async getAlertType(productName: string): Promise<string> {
    const row = this.getAlertRow(productName);
    const badge = row.locator(".badge").first();
    return (await badge.textContent()) ?? "";
  }

  /**
   * Get the message for a specific alert
   */
  async getAlertMessage(productName: string): Promise<string> {
    const row = this.getAlertRow(productName);
    const cells = row.locator("td");
    return (await cells.nth(2).textContent()) ?? "";
  }
}
