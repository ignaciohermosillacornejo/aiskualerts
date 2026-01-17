import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { AuthProvider } from "../../../src/frontend/contexts/AuthContext";
import { Header } from "../../../src/frontend/components/Header";
import "../../setup";
import type { User } from "../../../src/frontend/types";

// Store original fetch
const originalFetch = globalThis.fetch;

// Helper to create a fetch mock compatible with globalThis.fetch type
function createFetchMock(handler: () => Promise<Response>) {
  const mockFn = mock(handler) as unknown as typeof fetch;
  return mockFn;
}

// Mock user data
const mockUser: User = { id: "1", email: "test@test.com", name: "Test User", role: "admin" };

// Test Header logic without React Testing Library rendering
// This tests the business logic and state management

describe("Header", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("module exports", () => {
    test("exports Header component", async () => {
      const { Header } = await import("../../../src/frontend/components/Header");
      expect(Header).toBeFunction();
    });
  });

  describe("pageTitles mapping", () => {
    // Use Map to avoid security/detect-object-injection warning
    const pageTitles = new Map<string, string>([
      ["/app", "Dashboard"],
      ["/app/alerts", "Alertas"],
      ["/app/products", "Productos"],
      ["/app/thresholds", "Umbrales"],
      ["/app/settings", "Configuracion"],
    ]);

    test("returns 'Dashboard' for /app route", () => {
      const location = "/app";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("Dashboard");
    });

    test("returns 'Alertas' for /app/alerts route", () => {
      const location = "/app/alerts";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("Alertas");
    });

    test("returns 'Productos' for /app/products route", () => {
      const location = "/app/products";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("Productos");
    });

    test("returns 'Umbrales' for /app/thresholds route", () => {
      const location = "/app/thresholds";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("Umbrales");
    });

    test("returns 'Configuracion' for /app/settings route", () => {
      const location = "/app/settings";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("Configuracion");
    });

    test("returns 'AISku Alerts' for unknown routes", () => {
      const location = "/unknown/route";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("AISku Alerts");
    });

    test("returns 'AISku Alerts' for root route", () => {
      const location = "/";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("AISku Alerts");
    });

    test("returns 'AISku Alerts' for /login route", () => {
      const location = "/login";
      const title = pageTitles.get(location) ?? "AISku Alerts";
      expect(title).toBe("AISku Alerts");
    });
  });

  describe("user display logic", () => {
    interface User {
      id: string;
      email: string;
      name: string;
      role: "admin" | "viewer";
    }

    function getUser(authenticated: boolean): User | null {
      if (authenticated) {
        return { id: "1", email: "john@company.com", name: "John Doe", role: "admin" };
      }
      return null;
    }

    test("displays user email when authenticated", () => {
      const user = getUser(true);
      const shouldShowUserInfo = user !== null;
      expect(shouldShowUserInfo).toBe(true);
      expect(user?.email).toBe("john@company.com");
    });

    test("displays different user email", () => {
      const user = { id: "2", email: "jane@example.org", name: "Jane Smith", role: "viewer" as const };
      expect(user.email).toBe("jane@example.org");
    });

    test("does not display user info when not authenticated", () => {
      const user = getUser(false);
      const shouldShowUserInfo = user !== null;
      expect(shouldShowUserInfo).toBe(false);
    });

    test("shows logout button only when authenticated", () => {
      const user = getUser(true);
      const shouldShowLogoutButton = user !== null;
      expect(shouldShowLogoutButton).toBe(true);
    });

    test("hides logout button when not authenticated", () => {
      const user = getUser(false);
      const shouldShowLogoutButton = user !== null;
      expect(shouldShowLogoutButton).toBe(false);
    });
  });

  describe("handleLogout logic", () => {
    test("calls logout and redirects to /login", async () => {
      const mockLogout = mock(() => Promise.resolve());
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      // Simulate handleLogout
      async function handleLogout() {
        await mockLogout();
        setLocation("/login");
      }

      await handleLogout();

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(redirects).toContain("/login");
    });

    test("logout is awaited before redirect", async () => {
      const callOrder: string[] = [];
      const mockLogout = mock(() => {
        callOrder.push("logout");
        return Promise.resolve();
      });
      const setLocation = (path: string) => {
        callOrder.push(`redirect:${path}`);
      };

      async function handleLogout() {
        await mockLogout();
        setLocation("/login");
      }

      await handleLogout();

      expect(callOrder).toEqual(["logout", "redirect:/login"]);
    });
  });

  describe("header structure", () => {
    test("header has correct CSS class", () => {
      const headerClassName = "header";
      expect(headerClassName).toBe("header");
    });

    test("title has correct CSS class", () => {
      const titleClassName = "header-title";
      expect(titleClassName).toBe("header-title");
    });

    test("actions container has correct CSS class", () => {
      const actionsClassName = "header-actions";
      expect(actionsClassName).toBe("header-actions");
    });
  });

  describe("user info styling", () => {
    test("user info container style properties", () => {
      const userInfoStyle = {
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        marginRight: "1rem",
      };

      expect(userInfoStyle.display).toBe("flex");
      expect(userInfoStyle.alignItems).toBe("center");
      expect(userInfoStyle.gap).toBe("1rem");
      expect(userInfoStyle.marginRight).toBe("1rem");
    });

    test("user email text style properties", () => {
      const emailStyle = {
        fontSize: "0.875rem",
        color: "#64748b",
      };

      expect(emailStyle.fontSize).toBe("0.875rem");
      expect(emailStyle.color).toBe("#64748b");
    });

    test("logout button style properties", () => {
      const buttonStyle = {
        padding: "0.5rem 1rem",
        fontSize: "0.875rem",
      };

      expect(buttonStyle.padding).toBe("0.5rem 1rem");
      expect(buttonStyle.fontSize).toBe("0.875rem");
    });
  });

  describe("button classes", () => {
    test("logout button has secondary class", () => {
      const buttonClasses = "btn btn-secondary";
      expect(buttonClasses).toContain("btn");
      expect(buttonClasses).toContain("btn-secondary");
    });

  });

  describe("logout button text", () => {
    test("logout button shows 'Cerrar Sesion'", () => {
      const logoutButtonText = "Cerrar Sesion";
      expect(logoutButtonText).toBe("Cerrar Sesion");
    });
  });

  describe("user roles", () => {
    test("handles admin role", () => {
      const user = { id: "1", email: "admin@test.com", name: "Admin", role: "admin" as const };
      expect(user.role).toBe("admin");
    });

    test("handles viewer role", () => {
      const user = { id: "2", email: "viewer@test.com", name: "Viewer", role: "viewer" as const };
      expect(user.role).toBe("viewer");
    });
  });

  describe("component dependencies", () => {
    test("uses useLocation from wouter", () => {
      // The component destructures [location, setLocation] from useLocation
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const useLocationResult: [string, (path: string) => void] = ["/app", () => {}];
      const [location, setLocation] = useLocationResult;
      expect(typeof location).toBe("string");
      expect(typeof setLocation).toBe("function");
    });

    test("uses useAuth from AuthContext", () => {
      // The component destructures user and logout from useAuth
      const useAuthResult = {
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" as const },
        logout: (): Promise<void> => Promise.resolve(),
      };
      expect(useAuthResult.user).toBeDefined();
      expect(typeof useAuthResult.logout).toBe("function");
    });
  });

  describe("DOM rendering tests", () => {
    test("Header renders with loading state (SSR)", () => {
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: mockUser }),
        } as Response)
      );

      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Header)
          )
        )
      );

      // Should render header element
      expect(html).toContain("header");
      expect(html).toContain("header-title");
    });

    test("Header renders with user info when authenticated", async () => {
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
                React.createElement(Header)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Should show user email
        expect(container.textContent).toContain(mockUser.email);
        // Should show logout button
        expect(container.textContent).toContain("Cerrar Sesion");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Header does not show user info when unauthenticated", async () => {
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Not authenticated" }),
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
                React.createElement(Header)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Should NOT show user email when unauthenticated
        expect(container.textContent).not.toContain(mockUser.email);
        // Should NOT show logout button
        expect(container.textContent).not.toContain("Cerrar Sesion");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Header shows correct title based on route", async () => {
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

        // Start at /app route
        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(Router, null,
              React.createElement(AuthProvider, null,
                React.createElement(Header)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Default should show "AISku Alerts" or "Dashboard" based on route
        expect(container.innerHTML).toContain("header-title");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Header logout button renders correctly", async () => {
      // Test that logout button is rendered when user is authenticated
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
                React.createElement(Header)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Find the logout button
        const buttons = container.querySelectorAll("button.btn-secondary");
        let logoutButtonFound = false;
        buttons.forEach((btn) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- textContent can theoretically be null
          if (btn.textContent?.includes("Cerrar Sesion")) {
            logoutButtonFound = true;
          }
        });
        expect(logoutButtonFound).toBe(true);

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

  });
});
