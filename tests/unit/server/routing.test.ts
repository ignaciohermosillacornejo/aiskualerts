import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createServer } from "../../../src/server";
import type { Config } from "../../../src/config";
import type {
  LoginResponse,
  MeResponse,
  ErrorResponse,
  HealthResponse,
} from "../../test-types";

// Helper to wait for server to be ready
async function waitForServer(url: string, maxAttempts = 50): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[waitForServer] Waiting for ${url}, fetch type:`, typeof fetch, "Response type:", typeof Response);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      // eslint-disable-next-line no-console
      console.log(`[waitForServer] Attempt ${String(i + 1)}: status=${String(response.status)}, ok=${String(response.ok)}, constructor=${response.constructor.name}, keys=${Object.keys(response).join(",")}`);
      if (response.ok) {
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[waitForServer] Attempt ${String(i + 1)}: error=`, err instanceof Error ? err.message : err);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} did not become ready after ${String(maxAttempts)} attempts`);
}

describe("Server Routing", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  const mockConfig: Config = {
    port: 0, // Use port 0 to get a random available port
    nodeEnv: "test" as const,
    syncEnabled: false,
    syncHour: 2,
    syncMinute: 0,
    syncBatchSize: 100,
    syncTenantDelay: 5000,
    sentryEnvironment: "test",
  };

  beforeAll(async () => {
    server = createServer(mockConfig, {});
    // eslint-disable-next-line no-console
    console.log("[routing.test.ts] Server created, port:", server.port);
    baseUrl = `http://localhost:${String(server.port)}`;
    // eslint-disable-next-line no-console
    console.log("[routing.test.ts] baseUrl:", baseUrl);
    // Wait for server to be ready by polling health endpoint
    await waitForServer(baseUrl);
    // eslint-disable-next-line no-console
    console.log("[routing.test.ts] Server is ready");
  });

  afterAll(() => {
    void server.stop();
  });

  describe("Protected Routes (SPA)", () => {
    test("/ serves the React app", async () => {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      const text = await response.text();
      expect(text).toContain("<!DOCTYPE html>");
    });

    test("/login serves the React app", async () => {
      const response = await fetch(`${baseUrl}/login`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    test("/app serves the React app", async () => {
      const response = await fetch(`${baseUrl}/app`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    test("/app/alerts serves the React app", async () => {
      const response = await fetch(`${baseUrl}/app/alerts`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    test("/app/products serves the React app", async () => {
      const response = await fetch(`${baseUrl}/app/products`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    test("/app/thresholds serves the React app", async () => {
      const response = await fetch(`${baseUrl}/app/thresholds`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    test("/app/settings serves the React app", async () => {
      const response = await fetch(`${baseUrl}/app/settings`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });
  });

  describe("Unknown Routes (404)", () => {
    test("/alerts returns 404", async () => {
      const response = await fetch(`${baseUrl}/alerts`);
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toContain("404");
      expect(text).toContain("La página que buscas no existe");
    });

    test("/random returns 404", async () => {
      const response = await fetch(`${baseUrl}/random`);
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toContain("404");
    });

    test("/app/nonexistent returns 404", async () => {
      const response = await fetch(`${baseUrl}/app/nonexistent`);
      expect(response.status).toBe(404);
    });

    test("404 page includes link to home", async () => {
      const response = await fetch(`${baseUrl}/unknown`);
      const text = await response.text();
      expect(text).toContain('href="/"');
      expect(text).toContain("Volver al inicio");
    });
  });

  describe("API Routes", () => {
    test("/api/health returns 200", async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
      const data = await response.json() as HealthResponse;
      expect(data.status).toBe("ok");
    });

    test("/api/auth/login accepts POST", async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@test.com", password: "password" }),
      });
      expect(response.status).toBe(200);
      const data = await response.json() as LoginResponse;
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe("test@test.com");
    });

    test("/api/auth/me requires session cookie", async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      expect(response.status).toBe(401);
    });

    test("/api/auth/me returns user with valid cookie", async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: "session_token=mock_token_123",
        },
      });
      expect(response.status).toBe(200);
      const data = await response.json() as MeResponse;
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe("demo@empresa.cl");
    });

    test("/api/unknown returns 404", async () => {
      const response = await fetch(`${baseUrl}/api/unknown`);
      expect(response.status).toBe(404);
      const data = await response.json() as ErrorResponse;
      expect(data.error).toBe("Not Found");
    });
  });

  describe("Mock Auth Cookie Handling", () => {
    test("login sets session_token cookie", async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@test.com", password: "pass" }),
      });

      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("session_token=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("Max-Age=");
    });

    test("logout clears session_token cookie", async () => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
      });

      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("session_token=;");
      expect(setCookie).toContain("Max-Age=0");
    });

    test("login without credentials returns 400 validation error", async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json() as ErrorResponse;
      expect(data.error).toBe("Validation failed");
    });
  });

  describe("Health Check", () => {
    test("/health returns health status", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      const data = await response.json() as HealthResponse;
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
    });
  });
});
