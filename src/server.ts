/**
 * Production Server
 *
 * Minimal HTTP server with health check endpoint for deployment verification.
 * TODO: Add full application routes when Phase 2 (OAuth & Tenant Onboarding) begins.
 */

Bun.serve({
  port: 3000,
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);

    // Health check endpoint for deployment verification
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          phase: "Phase 1 Complete - Database & Bsale Integration",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Default response
    return new Response(
      JSON.stringify({
        message: "AI SKU Alerts - Phase 1 Complete",
        phase: "Waiting for Bsale OAuth approval to begin Phase 2",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
});

console.log("🚀 Server running on http://0.0.0.0:3000");
console.log("📊 Health check: http://0.0.0.0:3000/health");
