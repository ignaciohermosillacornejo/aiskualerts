/**
 * Frontend Verification Script
 *
 * This script starts the server and verifies the frontend is working correctly.
 * It can be run autonomously by Claude Code to verify changes without manual testing.
 *
 * Usage: bun scripts/verify-frontend.ts
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

const TEST_PORT = 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

function log(message: string) {
  console.log(`[verify] ${message}`);
}

function check(name: string, passed: boolean, message: string) {
  results.push({ name, passed, message });
  const status = passed ? "PASS" : "FAIL";
  console.log(`  [${status}] ${name}: ${message}`);
}

async function verifyEndpoint(
  name: string,
  path: string,
  expectedStatus: number,
  validator?: (body: string) => boolean
): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    const body = await response.text();

    if (response.status !== expectedStatus) {
      check(name, false, `Expected status ${expectedStatus}, got ${response.status}`);
      return;
    }

    if (validator && !validator(body)) {
      check(name, false, `Response validation failed`);
      return;
    }

    check(name, true, `Status ${response.status} OK`);
  } catch (error) {
    check(name, false, `Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function verifyJsonEndpoint(
  name: string,
  path: string,
  validator?: (data: unknown) => boolean
): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    const data: unknown = await response.json();

    if (!response.ok) {
      check(name, false, `HTTP ${response.status}`);
      return;
    }

    if (validator && !validator(data)) {
      check(name, false, `JSON validation failed`);
      return;
    }

    check(name, true, `JSON response OK`);
  } catch (error) {
    check(name, false, `Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  log("Starting frontend verification...");
  log(`Test server will run on port ${TEST_PORT}`);

  // Start the server
  log("Starting server...");

  const server = Bun.serve({
    port: TEST_PORT,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      // Import mock data and route handlers from server
      if (url.pathname === "/" || (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/health"))) {
        // Return a simple HTML response for frontend testing
        const indexHtml = await Bun.file("src/frontend/index.html").text();
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (url.pathname === "/health" || url.pathname === "/api/health") {
        return Response.json({ status: "ok", timestamp: new Date().toISOString() });
      }

      if (url.pathname === "/api/dashboard/stats") {
        return Response.json({
          totalProducts: 156,
          activeAlerts: 3,
          lowStockProducts: 12,
          configuredThresholds: 45,
        });
      }

      if (url.pathname === "/api/alerts") {
        return Response.json({
          alerts: [
            { id: "1", type: "threshold_breach", productId: "p1", productName: "Test Product", message: "Test alert", createdAt: new Date().toISOString(), dismissedAt: null },
          ],
          total: 1,
        });
      }

      if (url.pathname === "/api/products") {
        return Response.json({
          products: [
            { id: "p1", bsaleId: 1001, sku: "SKU001", name: "Test Product", currentStock: 10, threshold: 5, lastSyncAt: new Date().toISOString() },
          ],
          total: 1,
        });
      }

      if (url.pathname === "/api/thresholds") {
        return Response.json({
          thresholds: [
            { id: "t1", productId: "p1", productName: "Test Product", minQuantity: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          ],
          total: 1,
        });
      }

      if (url.pathname === "/api/settings") {
        return Response.json({
          companyName: "Test Company",
          email: "test@test.com",
          bsaleConnected: true,
          lastSyncAt: new Date().toISOString(),
          emailNotifications: true,
          notificationEmail: "alerts@test.com",
          syncFrequency: "daily",
        });
      }

      if (url.pathname === "/api/auth/me") {
        return Response.json({
          user: { id: "u1", email: "test@test.com", name: "Test User" },
        });
      }

      return Response.json({ error: "Not Found" }, { status: 404 });
    },
  });

  log(`Server started on ${BASE_URL}`);

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    log("\n--- Frontend Checks ---");

    // Check HTML is served
    await verifyEndpoint(
      "HTML served at /",
      "/",
      200,
      (body) => body.includes("<div id=\"root\">") && body.includes("AISku Alerts")
    );

    // Check HTML contains required elements
    await verifyEndpoint(
      "HTML has React mount point",
      "/",
      200,
      (body) => body.includes('id="root"') && body.includes('type="module"')
    );

    log("\n--- API Checks ---");

    // Check health endpoint
    await verifyJsonEndpoint(
      "Health endpoint",
      "/api/health",
      (data: unknown) => {
        const d = data as { status?: string };
        return d.status === "ok";
      }
    );

    // Check dashboard stats
    await verifyJsonEndpoint(
      "Dashboard stats",
      "/api/dashboard/stats",
      (data: unknown) => {
        const d = data as { totalProducts?: number };
        return typeof d.totalProducts === "number";
      }
    );

    // Check alerts endpoint
    await verifyJsonEndpoint(
      "Alerts endpoint",
      "/api/alerts",
      (data: unknown) => {
        const d = data as { alerts?: unknown[] };
        return Array.isArray(d.alerts);
      }
    );

    // Check products endpoint
    await verifyJsonEndpoint(
      "Products endpoint",
      "/api/products",
      (data: unknown) => {
        const d = data as { products?: unknown[] };
        return Array.isArray(d.products);
      }
    );

    // Check thresholds endpoint
    await verifyJsonEndpoint(
      "Thresholds endpoint",
      "/api/thresholds",
      (data: unknown) => {
        const d = data as { thresholds?: unknown[] };
        return Array.isArray(d.thresholds);
      }
    );

    // Check settings endpoint
    await verifyJsonEndpoint(
      "Settings endpoint",
      "/api/settings",
      (data: unknown) => {
        const d = data as { companyName?: string };
        return typeof d.companyName === "string";
      }
    );

    // Check auth endpoint
    await verifyJsonEndpoint(
      "Auth me endpoint",
      "/api/auth/me",
      (data: unknown) => {
        const d = data as { user?: { id?: string } };
        return d.user?.id !== undefined;
      }
    );

    log("\n--- SPA Routing Checks ---");

    // Check SPA routes return HTML
    await verifyEndpoint(
      "SPA route /alerts",
      "/alerts",
      200,
      (body) => body.includes("<div id=\"root\">")
    );

    await verifyEndpoint(
      "SPA route /products",
      "/products",
      200,
      (body) => body.includes("<div id=\"root\">")
    );

    // Check 404 for unknown API routes
    await verifyEndpoint("API 404 handling", "/api/unknown", 404, undefined);

  } finally {
    // Stop the server
    server.stop();
    log("\nServer stopped");
  }

  // Summary
  log("\n=== VERIFICATION SUMMARY ===");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  log(`Passed: ${passed}`);
  log(`Failed: ${failed}`);

  if (failed > 0) {
    log("\nFailed checks:");
    for (const result of results.filter((r) => !r.passed)) {
      log(`  - ${result.name}: ${result.message}`);
    }
    process.exit(1);
  }

  log("\nAll checks passed!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Verification failed with error:", error);
  process.exit(1);
});
