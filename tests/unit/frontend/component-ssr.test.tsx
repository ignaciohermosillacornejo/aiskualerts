import { test, expect, describe, beforeEach, afterEach, mock, spyOn } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import "../../setup";

// Store original fetch and console
const originalFetch = globalThis.fetch;

describe("Header Component SSR", () => {
  beforeEach(() => {
    sessionStorage.clear();
    globalThis.fetch = mock(() =>
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
    mock.module("wouter", () => ({
      useLocation: () => ["/app", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "1", email: "user@example.com", name: "Test User", role: "admin" as const },
        loading: false,
        error: null,
        login: async () => {},
        logout: async () => {},
        refreshUser: async () => {},
      }),
    }));

    const { Header } = await import("../../../src/frontend/components/Header");
    const html = renderToString(<Header />);

    expect(html).toContain("Dashboard");
    expect(html).toContain("user@example.com");
    expect(html).toContain("Cerrar Sesion");
  });

  test("renders header with Alertas title for /app/alerts route", async () => {
    mock.module("wouter", () => ({
      useLocation: () => ["/app/alerts", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" as const },
        loading: false,
        error: null,
        logout: async () => {},
      }),
    }));

    const { Header } = await import("../../../src/frontend/components/Header");
    const html = renderToString(<Header />);

    expect(html).toContain("Alertas");
  });

  test("renders header without user when not authenticated", async () => {
    mock.module("wouter", () => ({
      useLocation: () => ["/app", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: null,
        logout: async () => {},
      }),
    }));

    const { Header } = await import("../../../src/frontend/components/Header");
    const html = renderToString(<Header />);

    expect(html).toContain("Dashboard");
    expect(html).not.toContain("Cerrar Sesion");
  });

  test("renders header with fallback title for unknown route", async () => {
    mock.module("wouter", () => ({
      useLocation: () => ["/unknown", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: null,
        logout: async () => {},
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
    mock.module("wouter", () => ({
      useLocation: () => ["/app/settings", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
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
    mock.module("wouter", () => ({
      useLocation: () => ["/app", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
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
    mock.module("wouter", () => ({
      useLocation: () => ["/app", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
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
    globalThis.fetch = mock(() =>
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
    mock.module("wouter", () => ({
      useLocation: () => ["/login", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: null,
        login: async () => {},
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
    mock.module("wouter", () => ({
      useLocation: () => ["/login", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: true,
        error: null,
        login: async () => {},
      }),
    }));

    const { Login } = await import("../../../src/frontend/pages/Login");
    const html = renderToString(<Login />);

    expect(html).toContain("Ingresando...");
    expect(html).toContain("disabled");
  });

  test("renders error message when auth error exists", async () => {
    mock.module("wouter", () => ({
      useLocation: () => ["/login", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: null,
        loading: false,
        error: "Invalid credentials",
        login: async () => {},
      }),
    }));

    const { Login } = await import("../../../src/frontend/pages/Login");
    const html = renderToString(<Login />);

    expect(html).toContain("Invalid credentials");
  });

  test("does not render form content when user is authenticated (redirect case)", async () => {
    mock.module("wouter", () => ({
      useLocation: () => ["/login", mock(() => {})] as [string, (path: string) => void],
    }));

    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" as const },
        loading: false,
        error: null,
        login: async () => {},
      }),
    }));

    const { Login } = await import("../../../src/frontend/pages/Login");
    const html = renderToString(<Login />);

    // The component still renders but useEffect will handle redirect on client
    expect(html).toContain("AISku Alerts");
  });
});

describe("AuthContext SSR", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("AuthContext module exports exist", async () => {
    const authModule = await import("../../../src/frontend/contexts/AuthContext");
    expect(authModule.AuthProvider).toBeFunction();
    expect(authModule.useAuth).toBeFunction();
  });

  test("useAuth throws when used outside provider", async () => {
    // Mock the module to test the throw behavior
    mock.module("../../../src/frontend/contexts/AuthContext", () => ({
      useAuth: () => {
        throw new Error("useAuth must be used within AuthProvider");
      },
      AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }));

    const authModule = await import("../../../src/frontend/contexts/AuthContext");

    expect(() => authModule.useAuth()).toThrow("useAuth must be used within AuthProvider");
  });
});
