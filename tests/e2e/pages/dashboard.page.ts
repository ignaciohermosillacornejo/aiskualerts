import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for the Dashboard page (/app)
 * Main authenticated user view showing stats and alerts
 */
export class DashboardPage {
  readonly page: Page;

  // Loading state
  readonly loadingSpinner: Locator;

  // Error state
  readonly errorCard: Locator;
  readonly errorTitle: Locator;

  // Stats cards
  readonly statsGrid: Locator;
  readonly totalProductsStat: Locator;
  readonly activeAlertsStat: Locator;
  readonly lowStockStat: Locator;
  readonly thresholdsStat: Locator;

  // Sync section
  readonly syncCard: Locator;
  readonly syncButton: Locator;
  readonly lastSyncTime: Locator;
  readonly syncSuccessMessage: Locator;
  readonly syncErrorMessage: Locator;

  // Alerts section
  readonly alertsCard: Locator;
  readonly alertsTitle: Locator;
  readonly viewAllAlertsLink: Locator;
  readonly alertItems: Locator;
  readonly emptyAlertsMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Loading state
    this.loadingSpinner = page.locator(".spinner");

    // Error state
    this.errorCard = page.locator(".card", { hasText: "Error" });
    this.errorTitle = page.locator(".empty-state-title", { hasText: "Error" });

    // Stats grid
    this.statsGrid = page.locator(".stats-grid");
    this.totalProductsStat = page.locator(".stat-card", { hasText: "Productos Totales" });
    this.activeAlertsStat = page.locator(".stat-card", { hasText: "Alertas Activas" });
    this.lowStockStat = page.locator(".stat-card", { hasText: "Stock Bajo" });
    this.thresholdsStat = page.locator(".stat-card", { hasText: "Umbrales Configurados" });

    // Sync section
    this.syncCard = page.locator(".card", { hasText: "Sincronizacion" });
    this.syncButton = page.locator('button:has-text("Sincronizar Ahora")');
    this.lastSyncTime = page.locator('text=/Ultima sincronizacion:/');
    this.syncSuccessMessage = page.locator('text=Sincronización iniciada correctamente');
    this.syncErrorMessage = page.locator('text=Error en sincronizacion');

    // Alerts section
    this.alertsCard = page.locator(".card", { hasText: "Alertas Recientes" });
    this.alertsTitle = page.locator("h2", { hasText: "Alertas Recientes" });
    this.viewAllAlertsLink = page.locator('a:has-text("Ver todas")');
    this.alertItems = page.locator(".alert-item");
    this.emptyAlertsMessage = page.locator("text=No hay alertas activas en este momento");
  }

  /**
   * Navigate directly to the dashboard
   */
  async goto(): Promise<void> {
    await this.page.goto("/app");
  }

  /**
   * Wait for the dashboard to fully load (stats visible)
   */
  async waitForLoad(): Promise<void> {
    await this.statsGrid.waitFor({ state: "visible" });
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingComplete(): Promise<void> {
    // Wait for loading spinner to appear and then disappear
    await this.page.waitForFunction(
      () => !document.querySelector(".loading .spinner"),
      { timeout: 10000 }
    );
  }

  /**
   * Check if the dashboard is loaded and visible
   */
  async isLoaded(): Promise<boolean> {
    return await this.statsGrid.isVisible();
  }

  /**
   * Check if we're in the loading state
   */
  async isLoading(): Promise<boolean> {
    const loadingContainer = this.page.locator(".loading");
    return await loadingContainer.isVisible();
  }

  /**
   * Check if there's an error displayed
   */
  async hasError(): Promise<boolean> {
    return await this.errorTitle.isVisible();
  }

  /**
   * Get the value from a stat card
   */
  async getStatValue(statCard: Locator): Promise<number> {
    const valueText = await statCard.locator(".stat-value").textContent();
    return parseInt(valueText?.replace(/,/g, "") ?? "0", 10);
  }

  /**
   * Get total products count
   */
  async getTotalProducts(): Promise<number> {
    return this.getStatValue(this.totalProductsStat);
  }

  /**
   * Get active alerts count
   */
  async getActiveAlerts(): Promise<number> {
    return this.getStatValue(this.activeAlertsStat);
  }

  /**
   * Get low stock products count
   */
  async getLowStockCount(): Promise<number> {
    return this.getStatValue(this.lowStockStat);
  }

  /**
   * Get configured thresholds count
   */
  async getThresholdsCount(): Promise<number> {
    return this.getStatValue(this.thresholdsStat);
  }

  /**
   * Trigger a sync operation
   */
  async triggerSync(): Promise<void> {
    await this.syncButton.click();
  }

  /**
   * Wait for sync to complete
   */
  async waitForSyncComplete(): Promise<void> {
    // Wait for success or error message
    await Promise.race([
      this.syncSuccessMessage.waitFor({ state: "visible", timeout: 60000 }),
      this.syncErrorMessage.waitFor({ state: "visible", timeout: 60000 }),
    ]);
  }

  /**
   * Check if sync was successful
   */
  async isSyncSuccessful(): Promise<boolean> {
    return await this.syncSuccessMessage.isVisible();
  }

  /**
   * Navigate to all alerts page
   */
  async goToAllAlerts(): Promise<void> {
    await this.viewAllAlertsLink.click();
    await this.page.waitForURL(/\/app\/alerts/);
  }

  /**
   * Get count of displayed alert items
   */
  async getDisplayedAlertsCount(): Promise<number> {
    return await this.alertItems.count();
  }

  /**
   * Check if empty alerts message is shown
   */
  async hasNoAlerts(): Promise<boolean> {
    return await this.emptyAlertsMessage.isVisible();
  }
}
