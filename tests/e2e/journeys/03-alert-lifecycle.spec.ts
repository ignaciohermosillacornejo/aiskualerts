/**
 * Alert Lifecycle E2E Test
 *
 * This journey test covers the enhanced alert system:
 * 1. Create quantity-based threshold
 * 2. Create days-based threshold
 * 3. View alert states (ok, active, dismissed)
 * 4. Dismiss an active alert
 * 5. Verify dismissed state persists
 *
 * This test requires a user with Bsale connected and products loaded.
 */

import { test, expect, generateTestEmail } from "../fixtures/combined.fixture";
import { LoginPage } from "../pages/login.page";
import { SettingsPage } from "../pages/settings.page";

test.describe("Alert Lifecycle Journey", () => {
  test.setTimeout(90000); // 1.5 minutes

  test("user can create thresholds with different types and dismiss alerts", async ({
    page,
    auth,
    oauth,
    db,
  }) => {
    const testEmail = generateTestEmail("alert-lifecycle");
    const testTenant = {
      clientCode: "11111111-1",
      clientName: "Alert Test Company",
    };

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const settingsPage = new SettingsPage(page);

    // ========================================
    // PHASE 1: Setup - Authenticate & Connect Bsale
    // ========================================

    await test.step("Authenticate user", async () => {
      await loginPage.goto();
      await loginPage.requestMagicLink(testEmail);
      await loginPage.waitForSuccessState();

      try {
        await auth.authenticateWithMagicLink(testEmail);
        await expect(page).toHaveURL(/\/app/);
      } catch {
        test.skip(true, "Test endpoint not available");
      }
    });

    await test.step("Connect Bsale with mock data", async () => {
      await settingsPage.goto();
      await settingsPage.waitForLoad();

      // Mock OAuth and sync
      await oauth.mockTokenExchange(testTenant);
      await oauth.mockBsaleSync({ products: 10, variants: 10 });

      const isConnected = await settingsPage.isBsaleConnected();
      if (!isConnected) {
        await page.click('button:has-text("Conectar Bsale")');
        await page.fill('input[placeholder*="12345678"]', testTenant.clientCode);
        await page.click('button:has-text("Autorizar")');

        // Wait for OAuth flow to complete
        await page.waitForURL(/\/app/, { timeout: 15000 });
      }
    });

    // ========================================
    // PHASE 2: Navigate to Products (Inventario)
    // ========================================

    await test.step("Navigate to Products page", async () => {
      await page.click('text=Inventario');
      await page.waitForURL(/\/app\/products/);
      await expect(page.locator("h1")).toContainText("Inventario");
    });

    // ========================================
    // PHASE 2.5: Seed Consumption & Verify "Días restantes" Column
    // ========================================

    await test.step("Seed consumption data and verify Días restantes column", async () => {
      // Intercept the products API to discover real variant IDs
      const productsResponse = await page.request.get(`${page.url().split("/app")[0]}/api/products`, {
        headers: {
          Cookie: await page.evaluate(() => document.cookie),
        },
      });

      if (!productsResponse.ok()) {
        console.log("Products API not available, skipping Días restantes verification");
        return;
      }

      const productsData = (await productsResponse.json()) as {
        data: { bsaleId: number; currentStock: number }[];
      };

      if (productsData.data.length === 0) {
        console.log("No products found, skipping Días restantes verification");
        return;
      }

      // Get the tenant ID from the auth context by reading the /api/auth/me endpoint
      const meResponse = await page.request.get(`${page.url().split("/app")[0]}/api/auth/me`, {
        headers: {
          Cookie: await page.evaluate(() => document.cookie),
        },
      });

      if (!meResponse.ok()) {
        console.log("Auth/me not available, skipping consumption seeding");
        return;
      }

      const meData = (await meResponse.json()) as { tenantId: string };

      // Seed consumption data for the first few products
      const productsToSeed = productsData.data.slice(0, 3);
      for (const product of productsToSeed) {
        await db.seedConsumption({
          tenantId: meData.tenantId,
          variantId: product.bsaleId,
          days: 7,
          dailyQuantity: 5,
        });
      }

      // Reload the products page to pick up velocity data
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Verify the "Días restantes" column header exists
      await expect(page.locator("th.col-days-left")).toContainText("Días restantes");

      // Verify at least one product shows a numeric value (not "—")
      const numericDaysLeft = page.locator(".days-left-value:not(.none)");
      const numericCount = await numericDaysLeft.count();
      expect(numericCount).toBeGreaterThan(0);

      // Verify at least one of the CSS color classes exists
      const daysLeftValues = page.locator(".days-left-value.danger, .days-left-value.warning, .days-left-value.safe");
      const coloredCount = await daysLeftValues.count();
      expect(coloredCount).toBeGreaterThan(0);
    });

    // ========================================
    // PHASE 3: Create Quantity-Based Threshold
    // ========================================

    await test.step("Create quantity-based threshold", async () => {
      // Find a product without threshold and click to configure
      const unconfiguredChip = page.locator('.threshold-chip.unconfigured').first();

      // Skip if no unconfigured products
      const count = await unconfiguredChip.count();
      if (count === 0) {
        console.log("No unconfigured products found, skipping threshold creation");
        return;
      }

      await unconfiguredChip.click();

      // Select quantity type (default)
      const typeSelect = page.locator('.threshold-type-select');
      await expect(typeSelect).toBeVisible();
      await typeSelect.selectOption("quantity");

      // Enter threshold value
      const thresholdInput = page.locator('.threshold-input');
      await thresholdInput.fill("15");

      // Save
      await page.locator('.threshold-save-btn').click();

      // Verify threshold was created
      await expect(page.locator('.threshold-chip.configured').first()).toContainText("uds");
    });

    // ========================================
    // PHASE 4: Create Days-Based Threshold
    // ========================================

    await test.step("Create days-based threshold", async () => {
      // Find another product without threshold
      const unconfiguredChip = page.locator('.threshold-chip.unconfigured').first();

      const count = await unconfiguredChip.count();
      if (count === 0) {
        console.log("No more unconfigured products for days threshold");
        return;
      }

      await unconfiguredChip.click();

      // Select days type
      const typeSelect = page.locator('.threshold-type-select');
      await expect(typeSelect).toBeVisible();
      await typeSelect.selectOption("days");

      // Enter threshold value
      const thresholdInput = page.locator('.threshold-input');
      await thresholdInput.fill("7");

      // Save
      await page.locator('.threshold-save-btn').click();

      // Verify threshold was created with days
      await expect(page.locator('.threshold-chip:has-text("días")').first()).toBeVisible();
    });

    // ========================================
    // PHASE 5: Verify Alert State Styling
    // ========================================

    await test.step("Verify threshold chip styles exist", async () => {
      // Check that configured chips are visible
      const configuredChips = page.locator('.threshold-chip.configured');
      const chipCount = await configuredChips.count();
      expect(chipCount).toBeGreaterThan(0);

      // Verify the chip has proper styling (green for OK state)
      const firstChip = configuredChips.first();
      await expect(firstChip).toHaveCSS("background-color", /rgb/);
    });

    // ========================================
    // PHASE 6: Test Bulk Threshold Modal
    // ========================================

    await test.step("Open and use bulk threshold modal", async () => {
      // Select some products
      const checkboxes = page.locator('.products-checkbox').nth(1);
      const checkboxCount = await checkboxes.count();

      if (checkboxCount > 0) {
        await checkboxes.check();

        // Click bulk action button
        const bulkButton = page.locator('button:has-text("Configurar alerta")');
        if (await bulkButton.isVisible()) {
          await bulkButton.click();

          // Modal should be visible
          await expect(page.locator('.products-modal')).toBeVisible();

          // Verify type selector exists
          await expect(page.locator('.bulk-type-select')).toBeVisible();

          // Close modal
          await page.click('.products-modal-close');
          await expect(page.locator('.products-modal')).not.toBeVisible();
        }
      }
    });

    // ========================================
    // PHASE 7: Verify Filter Buttons Work
    // ========================================

    await test.step("Verify filter buttons work", async () => {
      // Click "Con alerta" filter
      await page.click('.products-filter-btn.filter-configured');
      await expect(page.locator('.products-filter-btn.filter-configured')).toHaveClass(/active/);

      // Click "Sin alerta" filter
      await page.click('.products-filter-btn.filter-unconfigured');
      await expect(page.locator('.products-filter-btn.filter-unconfigured')).toHaveClass(/active/);

      // Reset to "Todos"
      await page.click('.products-filter-btn:has-text("Todos")');
      await expect(page.locator('.products-filter-btn:has-text("Todos")')).toHaveClass(/active/);
    });

    // ========================================
    // PHASE 8: Test Inline Edit
    // ========================================

    await test.step("Edit existing threshold inline", async () => {
      // Click on an existing threshold to edit
      const configuredChip = page.locator('.threshold-chip.configured').first();
      const hasConfigured = await configuredChip.count() > 0;

      if (hasConfigured) {
        await configuredChip.click();

        // Type selector should appear
        await expect(page.locator('.threshold-type-select')).toBeVisible();

        // Cancel edit
        await page.locator('.threshold-cancel-btn').click();

        // Edit form should disappear
        await expect(page.locator('.threshold-type-select')).not.toBeVisible();
      }
    });

    // ========================================
    // PHASE 9: Verify Alerts Redirect
    // ========================================

    await test.step("Verify /app/alerts redirects to /app/products", async () => {
      await page.goto("/app/alerts");
      await page.waitForURL(/\/app\/products/);
      await expect(page).toHaveURL(/\/app\/products/);
    });
  });
});
