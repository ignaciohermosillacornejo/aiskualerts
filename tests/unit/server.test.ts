import { test, expect, afterEach, describe } from "bun:test";
import { createServer, createHealthResponse, type HealthResponse } from "@/server";
import type { Config } from "@/config";

const testConfig: Config = {
  port: 0, // Use port 0 to get a random available port
  nodeEnv: "test",
  syncEnabled: false,
  syncHour: 2,
  syncMinute: 0,
  syncBatchSize: 100,
  syncTenantDelay: 5000,
};

let serverInstance: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (serverInstance) {
    await serverInstance.stop(true);
    serverInstance = null;
  }
});

describe("createHealthResponse", () => {
  test("returns status ok", () => {
    const response = createHealthResponse();
    expect(response.status).toBe("ok");
  });

  test("returns valid ISO timestamp", () => {
    const before = new Date().toISOString();
    const response = createHealthResponse();
    const after = new Date().toISOString();

    expect(response.timestamp).toBeDefined();
    expect(response.timestamp >= before).toBe(true);
    expect(response.timestamp <= after).toBe(true);
  });

  test("returns correctly typed response", () => {
    const response: HealthResponse = createHealthResponse();
    expect(response).toHaveProperty("status");
    expect(response).toHaveProperty("timestamp");
  });
});

describe("createServer", () => {
  test("creates a server instance", () => {
    serverInstance = createServer(testConfig);
    expect(serverInstance).toBeDefined();
    expect(serverInstance.port).toBeGreaterThan(0);
  });

  test("health endpoint returns 200 with correct body", async () => {
    serverInstance = createServer(testConfig);
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  test("health endpoint only accepts GET requests", async () => {
    serverInstance = createServer(testConfig);

    // POST to /health falls through to 404 (only GET is defined for /health)
    const postResponse = await fetch(`http://localhost:${String(serverInstance.port)}/health`, {
      method: "POST",
    });
    expect(postResponse.status).toBe(404);
  });

  test("unknown routes return 404", async () => {
    serverInstance = createServer(testConfig);

    // Unknown routes return 404 (only explicit routes are served)
    const response = await fetch(`http://localhost:${String(serverInstance.port)}/unknown`);
    expect(response.status).toBe(404);
  });

  test("unknown API routes return 404 JSON", async () => {
    serverInstance = createServer(testConfig);

    const response = await fetch(`http://localhost:${String(serverInstance.port)}/api/unknown`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Not Found");
  });

  test("root path returns React frontend", async () => {
    serverInstance = createServer(testConfig);

    const response = await fetch(`http://localhost:${String(serverInstance.port)}/`);
    expect(response.status).toBe(200);
  });

  test("server respects configured port", () => {
    const customConfig: Config = {
      port: 0,
      nodeEnv: "test",
      syncEnabled: false,
      syncHour: 2,
      syncMinute: 0,
      syncBatchSize: 100,
      syncTenantDelay: 5000,
    };
    serverInstance = createServer(customConfig);
    expect(serverInstance.port).toBeGreaterThan(0);
  });

  test("development mode is disabled in production", () => {
    const productionConfig: Config = {
      port: 0,
      nodeEnv: "production",
      syncEnabled: false,
      syncHour: 2,
      syncMinute: 0,
      syncBatchSize: 100,
      syncTenantDelay: 5000,
    };
    serverInstance = createServer(productionConfig);
    // In production, development must be false to avoid JSX runtime errors
    // (jsxDEV is only available in development builds)
    expect(serverInstance.development).toBe(false);
  });

  test("development mode is enabled in non-production environments", () => {
    const devConfig: Config = {
      port: 0,
      nodeEnv: "development",
      syncEnabled: false,
      syncHour: 2,
      syncMinute: 0,
      syncBatchSize: 100,
      syncTenantDelay: 5000,
    };
    serverInstance = createServer(devConfig);
    expect(serverInstance.development).toBe(true);
  });
});
