import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";

/**
 * Server E2E Tests
 *
 * Tests the actual server by starting it and making HTTP requests.
 * These tests verify that routes work end-to-end in a real environment.
 */

const TEST_PORT = 3001; // Use different port to avoid conflicts
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess: ReturnType<typeof Bun.spawn> | null = null;

describe("Server E2E Tests", () => {
  beforeAll(async () => {
    // Build CSS before starting server
    await $`bun run build:css`.quiet();

    // Start the server in the background
    serverProcess = Bun.spawn(["bun", "src/server.ts"], {
      env: { ...process.env, PORT: String(TEST_PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });

    // Wait for server to be ready
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        if (response.ok) {
          console.info("✅ Test server ready");
          break;
        }
      } catch {
        // Server not ready yet
      }
      await Bun.sleep(100);
      attempts++;
    }

    if (attempts === maxAttempts) {
      throw new Error("Test server failed to start");
    }
  }, 10000); // 10s timeout for server startup

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      console.info("✅ Test server stopped");
    }
  });

  test("GET /health should return 200 with status ok", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe("string");
  });

  test("GET /health timestamp should be valid ISO date", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    const timestamp = new Date(data.timestamp);
    expect(timestamp.toString()).not.toBe("Invalid Date");
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("GET / should return landing page HTML", async () => {
    const response = await fetch(`${BASE_URL}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("AI SKU Alerts");
  });

  test("GET /api/auth/bsale/start should return 501 Not Implemented", async () => {
    const response = await fetch(`${BASE_URL}/api/auth/bsale/start`);
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.message).toBe("OAuth not yet implemented");
  });

  test("GET / should load CSS successfully", async () => {
    const response = await fetch(`${BASE_URL}/`);
    const html = await response.text();

    // Check CSS link is present (Bun transforms to bundled assets)
    expect(html).toContain("<link rel=\"stylesheet\"");
    expect(html).toContain(".css\">");
  });

  test("GET / should load React script successfully", async () => {
    const response = await fetch(`${BASE_URL}/`);
    const html = await response.text();

    // Check script is present (Bun transforms to bundled assets)
    expect(html).toContain("<script");
    expect(html).toContain("type=\"module\"");
  });
});
