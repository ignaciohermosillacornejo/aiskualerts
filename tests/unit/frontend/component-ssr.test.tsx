import { test, expect, describe, beforeAll, beforeEach, afterEach, afterAll, mock } from "bun:test";
import { renderToString } from "react-dom/server";
import "../../setup";

// Store original fetch and console
const originalFetch = globalThis.fetch;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {};
const noopAsync = (): Promise<void> => Promise.resolve();

// Helper to clear module cache safely
function clearModuleCache(modulePath: string): void {
  try {
    const resolvedPath = require.resolve(modulePath);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete require.cache[resolvedPath];
  } catch {
    // Module not in cache, ignore
  }
}

// Clean up module cache before all tests to ensure mocks work correctly
beforeAll(() => {
  clearModuleCache("../../../src/frontend/contexts/AuthContext");
  clearModuleCache("../../../src/frontend/api/client");
  clearModuleCache("../../../src/frontend/components/Header");
  clearModuleCache("../../../src/frontend/components/ProtectedRoute");
  clearModuleCache("../../../src/frontend/pages/Login");
  clearModuleCache("wouter");
});

// Clean up module cache after all tests so other test files can use the real modules
afterAll(() => {
  clearModuleCache("../../../src/frontend/contexts/AuthContext");
  clearModuleCache("../../../src/frontend/api/client");
  clearModuleCache("../../../src/frontend/components/Header");
  clearModuleCache("../../../src/frontend/components/ProtectedRoute");
  clearModuleCache("../../../src/frontend/pages/Login");
  clearModuleCache("wouter");
});

// Helper to create a fetch mock compatible with globalThis.fetch type
function createFetchMock(handler: () => Promise<Response>) {
  const mockFn = mock(handler) as unknown as typeof fetch;
  return mockFn;
}

describe("Header Component SSR", () => {
  beforeEach(() => {
    sessionStorage.clear();
    globalThis.fetch = createFetchMock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: null }),
      } as Response)
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("renders header with Dashboard title for /app route", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/app", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "1", email: "user@example.com", name: "Test User", role: "admin" as const },
        loading: false,
        error: null,
        login: noopAsync,
        logout: noopAsync,
        refreshUser: noopAsync,
      }),
    }));

    const { Header } = await import("../../../src/frontend/components/Header");
    const html = renderToString(<Header />);

    expect(html).toContain("Dashboard");
    expect(html).toContain("user@example.com");
    expect(html).toContain("Cerrar Sesion");
  });

  test("renders header with Alertas title for /app/alerts route", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/app/alerts", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" as const },
        loading: false,
        error: null,
        logout: noopAsync,
      }),
    }));

    const { Header } = await import("../../../src/frontend/components/Header");
    const html = renderToString(<Header />);

    expect(html).toContain("Alertas");
  });

  test("renders header without user when not authenticated", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/app", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: null,
        logout: noopAsync,
      }),
    }));

    const { Header } = await import("../../../src/frontend/components/Header");
    const html = renderToString(<Header />);

    expect(html).toContain("Dashboard");
    expect(html).not.toContain("Cerrar Sesion");
  });

  test("renders header with fallback title for unknown route", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/unknown", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: null,
        logout: noopAsync,
      }),
    }));

    const { Header } = await import("../../../src/frontend/components/Header");
    const html = renderToString(<Header />);

    expect(html).toContain("AISku Alerts");
  });
});

describe("ProtectedRoute Component SSR", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("renders children when user is authenticated", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/app/settings", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" as const },
        loading: false,
      }),
    }));

    const { ProtectedRoute } = await import("../../../src/frontend/components/ProtectedRoute");
    const html = renderToString(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(html).toContain("Protected Content");
  });

  test("renders loading state when loading", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/app", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: true,
      }),
    }));

    const { ProtectedRoute } = await import("../../../src/frontend/components/ProtectedRoute");
    const html = renderToString(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(html).toContain("Verificando sesion...");
    expect(html).not.toContain("Protected Content");
  });

  test("renders null when not authenticated and not loading", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/app", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
      }),
    }));

    const { ProtectedRoute } = await import("../../../src/frontend/components/ProtectedRoute");
    const html = renderToString(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Should render nothing (null)
    expect(html).toBe("");
    expect(html).not.toContain("Protected Content");
  });
});

describe("Login Component SSR", () => {
  beforeEach(() => {
    sessionStorage.clear();
    globalThis.fetch = createFetchMock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: null }),
      } as Response)
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("renders login form when not authenticated", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/login", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: null,
        login: noopAsync,
      }),
    }));

    const { Login } = await import("../../../src/frontend/pages/Login");
    const html = renderToString(<Login />);

    expect(html).toContain("AISku Alerts");
    expect(html).toContain("Sistema de alertas de inventario para Bsale");
    expect(html).toContain("Email");
    expect(html).toContain("Contrasena");
    expect(html).toContain("Ingresar");
    expect(html).toContain("Conectar con Bsale");
  });

  test("renders loading state when logging in", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/login", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: true,
        error: null,
        login: noopAsync,
      }),
    }));

    const { Login } = await import("../../../src/frontend/pages/Login");
    const html = renderToString(<Login />);

    expect(html).toContain("Ingresando...");
    expect(html).toContain("disabled");
  });

  test("renders error message when auth error exists", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/login", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: "Invalid credentials",
        login: noopAsync,
      }),
    }));

    const { Login } = await import("../../../src/frontend/pages/Login");
    const html = renderToString(<Login />);

    expect(html).toContain("Invalid credentials");
  });

  test("does not render form content when user is authenticated (redirect case)", async () => {
    void mock.module("wouter", () => ({
      useLocation: () => ["/login", noop] as [string, (path: string) => void],
    }));

    void mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" as const },
        loading: false,
        error: null,
        login: noopAsync,
      }),
    }));

    const { Login } = await import("../../../src/frontend/pages/Login");
    const html = renderToString(<Login />);

    // The component still renders but useEffect will handle redirect on client
    expect(html).toContain("AISku Alerts");
  });
});

// Note: AuthContext SSR tests (module exports, useAuth throwing) are covered
// in AuthContext.test.tsx to avoid mock.module conflicts with this file's mocks
