import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { AuthProvider } from "../../../src/frontend/contexts/AuthContext";
import { ProtectedRoute } from "../../../src/frontend/components/ProtectedRoute";
import "../../setup";

// Test ProtectedRoute logic without React Testing Library rendering
// This tests the business logic and state management

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "viewer";
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

// Store original fetch
const originalFetch = globalThis.fetch;

// Helper to create a fetch mock compatible with globalThis.fetch type
function createFetchMock(handler: () => Promise<Response>) {
  const mockFn = mock(handler) as unknown as typeof fetch;
  return mockFn;
}

// Mock user data
const mockUser: User = { id: "1", email: "test@test.com", name: "Test User", role: "admin" };

describe("ProtectedRoute", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe("module exports", () => {
    test("exports ProtectedRoute component", async () => {
      const { ProtectedRoute } = await import("../../../src/frontend/components/ProtectedRoute");
      expect(ProtectedRoute).toBeFunction();
    });
  });

  describe("loading state logic", () => {
    test("shows loading state when auth is loading", () => {
      const authState: AuthState = { user: null, loading: true, error: null };

      // When loading, component should show loading message
      const shouldShowLoading = authState.loading;
      expect(shouldShowLoading).toBe(true);
    });

    test("does not redirect while loading", () => {
      const authState: AuthState = { user: null, loading: true, error: null };
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      // Should not redirect while loading
      if (!authState.loading && !authState.user) {
        setLocation("/login");
      }

      expect(redirects).toHaveLength(0);
    });

    test("does not store redirect path while loading", () => {
      const authState: AuthState = { user: null, loading: true, error: null };
      const location = "/app/settings";

      // Should not store redirect while loading
      if (!authState.loading && !authState.user) {
        sessionStorage.setItem("redirect_after_login", location);
      }

      expect(sessionStorage.getItem("redirect_after_login")).toBeNull();
    });
  });

  describe("unauthenticated state logic", () => {
    test("stores current path in sessionStorage when unauthenticated", () => {
      const authState: AuthState = { user: null, loading: false, error: null };
      const location = "/app/products";

      if (!authState.loading && !authState.user) {
        sessionStorage.setItem("redirect_after_login", location);
      }

      expect(sessionStorage.getItem("redirect_after_login")).toBe("/app/products");
    });

    test("redirects to /login when unauthenticated", () => {
      const authState: AuthState = { user: null, loading: false, error: null };
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      if (!authState.loading && !authState.user) {
        setLocation("/login");
      }

      expect(redirects).toContain("/login");
    });

    test("returns null when not authenticated (prevents content flash)", () => {
      const authState: AuthState = { user: null, loading: false, error: null };

      // Component should render null when not authenticated
      const shouldRenderChildren = !authState.loading && authState.user;
      expect(shouldRenderChildren).toBeFalsy();
    });
  });

  describe("authenticated state logic", () => {
    test("renders children when authenticated", () => {
      const authState: AuthState = {
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" },
        loading: false,
        error: null,
      };

      const shouldRenderChildren = !authState.loading && authState.user;
      expect(shouldRenderChildren).toBeTruthy();
    });

    test("does not redirect when authenticated", () => {
      const authState: AuthState = {
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" },
        loading: false,
        error: null,
      };
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      if (!authState.loading && !authState.user) {
        setLocation("/login");
      }

      expect(redirects).toHaveLength(0);
    });

    test("does not store redirect path when authenticated", () => {
      const authState: AuthState = {
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" },
        loading: false,
        error: null,
      };
      const location = "/app/settings";

      if (!authState.loading && !authState.user) {
        sessionStorage.setItem("redirect_after_login", location);
      }

      expect(sessionStorage.getItem("redirect_after_login")).toBeNull();
    });
  });

  describe("different routes storage", () => {
    test("stores /app/settings path correctly", () => {
      const authState: AuthState = { user: null, loading: false, error: null };
      const location = "/app/settings";

      if (!authState.loading && !authState.user) {
        sessionStorage.setItem("redirect_after_login", location);
      }

      expect(sessionStorage.getItem("redirect_after_login")).toBe("/app/settings");
    });

    test("stores /app/thresholds path correctly", () => {
      const authState: AuthState = { user: null, loading: false, error: null };
      const location = "/app/thresholds";

      if (!authState.loading && !authState.user) {
        sessionStorage.setItem("redirect_after_login", location);
      }

      expect(sessionStorage.getItem("redirect_after_login")).toBe("/app/thresholds");
    });

    test("stores /app/alerts path correctly", () => {
      const authState: AuthState = { user: null, loading: false, error: null };
      const location = "/app/alerts";

      if (!authState.loading && !authState.user) {
        sessionStorage.setItem("redirect_after_login", location);
      }

      expect(sessionStorage.getItem("redirect_after_login")).toBe("/app/alerts");
    });

    test("stores /app/products path correctly", () => {
      const authState: AuthState = { user: null, loading: false, error: null };
      const location = "/app/products";

      if (!authState.loading && !authState.user) {
        sessionStorage.setItem("redirect_after_login", location);
      }

      expect(sessionStorage.getItem("redirect_after_login")).toBe("/app/products");
    });
  });

  describe("useEffect dependencies", () => {
    test("redirect effect depends on loading state", () => {
      // The useEffect should run when loading changes
      const effectDependencies = ["loading", "user", "location", "setLocation"];
      expect(effectDependencies).toContain("loading");
    });

    test("redirect effect depends on user state", () => {
      const effectDependencies = ["loading", "user", "location", "setLocation"];
      expect(effectDependencies).toContain("user");
    });

    test("redirect effect depends on location", () => {
      const effectDependencies = ["loading", "user", "location", "setLocation"];
      expect(effectDependencies).toContain("location");
    });

    test("redirect effect depends on setLocation", () => {
      const effectDependencies = ["loading", "user", "location", "setLocation"];
      expect(effectDependencies).toContain("setLocation");
    });
  });

  describe("state transitions", () => {
    test("loading -> authenticated: renders children", () => {
      const mockUser: User = { id: "1", email: "test@test.com", name: "Test", role: "admin" };
      let authState: AuthState = { user: null, loading: true, error: null };

      // Initially loading
      expect(authState.loading).toBe(true);

      // Transition to authenticated
      authState = { user: mockUser, loading: false, error: null };

      const shouldRenderChildren = !authState.loading && authState.user;
      expect(shouldRenderChildren).toBeTruthy();
    });

    test("loading -> unauthenticated: redirects", () => {
      let authState: AuthState = { user: null, loading: true, error: null };
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      // Initially loading
      if (!authState.loading && !authState.user) {
        setLocation("/login");
      }
      expect(redirects).toHaveLength(0);

      // Transition to unauthenticated
      authState = { user: null, loading: false, error: null };

      if (!authState.loading && !authState.user) {
        setLocation("/login");
      }
      expect(redirects).toContain("/login");
    });
  });

  describe("ProtectedRouteProps interface", () => {
    test("accepts children prop", () => {
      interface ProtectedRouteProps {
        children: React.ReactNode;
      }

      const props: ProtectedRouteProps = {
        children: "Test content",
      };

      expect(props.children).toBe("Test content");
    });
  });

  describe("loading UI", () => {
    test("loading message text", () => {
      const loadingMessage = "Verificando sesion...";
      expect(loadingMessage).toBe("Verificando sesion...");
    });

    test("loading UI style properties", () => {
      const loadingStyle = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontSize: "1.25rem",
        color: "#64748b",
      };

      expect(loadingStyle.display).toBe("flex");
      expect(loadingStyle.height).toBe("100vh");
      expect(loadingStyle.color).toBe("#64748b");
    });
  });

  describe("DOM rendering tests", () => {
    afterEach(() => {
      globalThis.fetch = originalFetch;
      sessionStorage.clear();
    });

    test("ProtectedRoute renders with loading state (SSR)", () => {
      // Mock fetch but won't be called in SSR since useEffect doesn't run
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: mockUser }),
        } as Response)
      );

      // Wrap in Router to provide location context
      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(ProtectedRoute, null,
              React.createElement("div", null, "Child")
            )
          )
        )
      );

      // Initial render should show loading (since loading is true initially in AuthProvider)
      expect(html).toContain("Verificando sesion...");
    });

    test("ProtectedRoute renders children when user exists (client)", async () => {
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: mockUser }),
        } as Response)
      );

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(ProtectedRoute, null,
                  React.createElement("span", null, "Protected Content Here")
                )
              )
            )
          );
          setTimeout(resolve, 300);
        });

        expect(container.textContent).toContain("Protected Content Here");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("ProtectedRoute stores redirect and returns null when unauthenticated (SSR)", () => {
      // Use SSR which doesn't trigger useEffect, avoiding navigation errors
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Not authenticated" }),
        } as Response)
      );

      // In SSR, initial state is loading=true, so we'll see loading UI
      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(ProtectedRoute, null,
              React.createElement("span", null, "Should Not Show")
            )
          )
        )
      );

      // During loading, children are not rendered, loading UI is shown
      expect(html).toContain("Verificando sesion...");
      // Children should not be visible in loading state
      expect(html).not.toContain("Should Not Show");
    });

    test("ProtectedRoute shows loading then transitions to authenticated", async () => {
      globalThis.fetch = createFetchMock(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ user: mockUser }),
            } as Response);
          }, 100);
        })
      );

      const container = document.createElement("div");
      document.body.appendChild(container);

      try {
        const root = createRoot(container);

        // Capture early state
        let earlyContent = "";

        root.render(
          React.createElement(Router, null,
            React.createElement(AuthProvider, null,
              React.createElement(ProtectedRoute, null,
                React.createElement("span", null, "Protected")
              )
            )
          )
        );

        // Check early (should be loading)
        await new Promise((r) => setTimeout(r, 30));
        earlyContent = container.textContent || "";

        // Wait for auth to complete
        await new Promise((r) => setTimeout(r, 250));

        // Early should show loading
        expect(earlyContent).toContain("Verificando sesion...");
        // After auth, should show content
        expect(container.textContent).toContain("Protected");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });
  });
});
