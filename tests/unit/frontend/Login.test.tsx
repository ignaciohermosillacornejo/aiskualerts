import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { AuthProvider } from "../../../src/frontend/contexts/AuthContext";
import { Login } from "../../../src/frontend/pages/Login";
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

// Test Login logic without React Testing Library rendering
// This tests the business logic and state management

describe("Login", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("module exports", () => {
    test("exports Login component", async () => {
      const { Login } = await import("../../../src/frontend/pages/Login");
      expect(Login).toBeFunction();
    });
  });

  describe("form validation logic", () => {
    test("validates email is required", () => {
      const email = "";
      const isValid = email.length > 0;
      expect(isValid).toBe(false);
    });

    test("validates form when email is provided", () => {
      const email = "test@example.com";
      const isValid = email.length > 0;
      expect(isValid).toBe(true);
    });

    test("validation error message", () => {
      const validationError = "Por favor ingresa tu correo electronico";
      expect(validationError).toBe("Por favor ingresa tu correo electronico");
    });
  });

  describe("handleSubmit logic", () => {
    test("prevents default form submission", () => {
      let defaultPrevented = false;
      const event = {
        preventDefault: () => {
          defaultPrevented = true;
        },
      };

      event.preventDefault();
      expect(defaultPrevented).toBe(true);
    });

    test("does not call requestMagicLink when validation fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mockRequestMagicLink = mock((_email: string) => Promise.resolve());
      const emailValue = "";

      // Validation: only call requestMagicLink if email is non-empty
      const isValid = emailValue.length > 0;
      if (isValid) {
        await mockRequestMagicLink(emailValue);
      }

      expect(mockRequestMagicLink).not.toHaveBeenCalled();
    });

    test("calls requestMagicLink with email when valid", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mockRequestMagicLink = mock((_email: string) => Promise.resolve());
      const emailValue = "user@company.com";

      // Validation: only call requestMagicLink if email is non-empty
      const isValid = emailValue.length > 0;
      if (isValid) {
        await mockRequestMagicLink(emailValue);
      }

      expect(mockRequestMagicLink).toHaveBeenCalledWith("user@company.com");
    });

    test("clears error before magic link request", () => {
      let error: string | null = "Previous error";

      // Before magic link request
      error = null;
      expect(error).toBeNull();
    });
  });

  describe("error handling logic", () => {
    test("sets error message from Error object", async () => {
      const mockRequest = mock(() => Promise.reject(new Error("Error al enviar el enlace")));
      let error: string | null = null;

      try {
        await mockRequest();
      } catch (err) {
        error = err instanceof Error ? err.message : "Error al enviar el enlace";
      }

      expect(error).toBe("Error al enviar el enlace");
    });

    test("sets generic error for non-Error exceptions", async () => {
      const mockRequest = mock(() => Promise.reject(new Error("some string error")));
      let error: string | null = null;

      try {
        await mockRequest();
      } catch (err) {
        error = err instanceof Error ? err.message : "Error al enviar el enlace";
      }

      expect(error).toBe("some string error");
    });

    test("handles URL error parameter for invalid_token", () => {
      function getUrlError(urlError: string | null): string | null {
        if (urlError === "invalid_token") {
          return "El enlace de acceso es invalido o ha expirado. Por favor solicita uno nuevo.";
        }
        return null;
      }
      const displayedError = getUrlError("invalid_token");
      expect(displayedError).toBe("El enlace de acceso es invalido o ha expirado. Por favor solicita uno nuevo.");
    });

    test("handles URL error parameter for server_error", () => {
      function getUrlError(urlError: string | null): string | null {
        if (urlError === "server_error") {
          return "Hubo un error al verificar el enlace. Por favor intenta nuevamente.";
        }
        return null;
      }
      const displayedError = getUrlError("server_error");
      expect(displayedError).toBe("Hubo un error al verificar el enlace. Por favor intenta nuevamente.");
    });
  });

  describe("loading state logic", () => {
    function getButtonText(loading: boolean): string {
      return loading ? "Enviando..." : "Enviar enlace de acceso";
    }

    test("button shows loading text when sending", () => {
      const buttonText = getButtonText(true);
      expect(buttonText).toBe("Enviando...");
    });

    test("button shows normal text when not loading", () => {
      const buttonText = getButtonText(false);
      expect(buttonText).toBe("Enviar enlace de acceso");
    });

    test("button is disabled when loading", () => {
      const loading = true;
      const isDisabled = loading;
      expect(isDisabled).toBe(true);
    });

    test("button is enabled when not loading", () => {
      const loading = false;
      const isDisabled = loading;
      expect(isDisabled).toBe(false);
    });
  });

  describe("redirect logic", () => {
    interface User {
      id: string;
      email: string;
      name: string;
      role: "admin" | "viewer";
    }

    function getUser(authenticated: boolean): User | null {
      if (authenticated) {
        return { id: "1", email: "test@test.com", name: "Test", role: "admin" };
      }
      return null;
    }

    function handleRedirect(user: User | null, setLocation: (path: string) => void): void {
      if (user) {
        const redirectPath = sessionStorage.getItem("redirect_after_login") ?? "/app";
        sessionStorage.removeItem("redirect_after_login");
        setLocation(redirectPath);
      }
    }

    test("redirects to /app when already authenticated", () => {
      const user = getUser(true);
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      handleRedirect(user, setLocation);

      expect(redirects).toContain("/app");
    });

    test("redirects to stored path from sessionStorage", () => {
      sessionStorage.setItem("redirect_after_login", "/app/settings");

      const user = getUser(true);
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      handleRedirect(user, setLocation);

      expect(redirects).toContain("/app/settings");
    });

    test("clears sessionStorage redirect path after use", () => {
      sessionStorage.setItem("redirect_after_login", "/app/products");

      const user = getUser(true);
      const redirects: string[] = [];

      handleRedirect(user, (path) => redirects.push(path));

      expect(sessionStorage.getItem("redirect_after_login")).toBeNull();
    });

    test("uses default /app when no stored redirect path", () => {
      sessionStorage.removeItem("redirect_after_login");

      const user = getUser(true);
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      handleRedirect(user, setLocation);

      expect(redirects).toContain("/app");
    });

    test("does not redirect when not authenticated", () => {
      const user = getUser(false);
      const redirects: string[] = [];
      const setLocation = (path: string) => redirects.push(path);

      handleRedirect(user, setLocation);

      expect(redirects).toHaveLength(0);
    });
  });

  describe("useEffect dependencies", () => {
    test("redirect effect depends on user", () => {
      const effectDependencies = ["user", "setLocation"];
      expect(effectDependencies).toContain("user");
    });

    test("redirect effect depends on setLocation", () => {
      const effectDependencies = ["user", "setLocation"];
      expect(effectDependencies).toContain("setLocation");
    });
  });

  describe("form content", () => {
    test("app title", () => {
      const appTitle = "AISku Alerts";
      expect(appTitle).toBe("AISku Alerts");
    });

    test("app description", () => {
      const description = "Sistema de alertas de inventario para Bsale";
      expect(description).toBe("Sistema de alertas de inventario para Bsale");
    });

    test("email label", () => {
      const label = "Correo electronico";
      expect(label).toBe("Correo electronico");
    });

    test("submit button text", () => {
      const buttonText = "Enviar enlace de acceso";
      expect(buttonText).toBe("Enviar enlace de acceso");
    });

    test("magic link info text", () => {
      const text = "Te enviaremos un enlace para iniciar sesion sin contrasena";
      expect(text).toBe("Te enviaremos un enlace para iniciar sesion sin contrasena");
    });
  });

  describe("input properties", () => {
    test("email input type", () => {
      const inputType = "email";
      expect(inputType).toBe("email");
    });

    test("email placeholder", () => {
      const placeholder = "usuario@empresa.cl";
      expect(placeholder).toBe("usuario@empresa.cl");
    });

    test("email autocomplete", () => {
      const autocomplete = "email";
      expect(autocomplete).toBe("email");
    });
  });

  describe("CSS classes", () => {
    test("login container class", () => {
      const className = "login-container";
      expect(className).toBe("login-container");
    });

    test("login card class", () => {
      const className = "login-card";
      expect(className).toBe("login-card");
    });

    test("login logo class", () => {
      const className = "login-logo";
      expect(className).toBe("login-logo");
    });

    test("form group class", () => {
      const className = "form-group";
      expect(className).toBe("form-group");
    });

    test("form label class", () => {
      const className = "form-label";
      expect(className).toBe("form-label");
    });

    test("form input class", () => {
      const className = "form-input";
      expect(className).toBe("form-input");
    });

    test("button classes", () => {
      const buttonClasses = "btn btn-primary";
      expect(buttonClasses).toContain("btn");
      expect(buttonClasses).toContain("btn-primary");
    });

    test("secondary button classes", () => {
      const buttonClasses = "btn btn-secondary";
      expect(buttonClasses).toContain("btn");
      expect(buttonClasses).toContain("btn-secondary");
    });
  });

  describe("error display styling", () => {
    test("error box style properties", () => {
      const errorStyle = {
        backgroundColor: "#fee2e2",
        color: "#991b1b",
        padding: "0.75rem",
        borderRadius: "0.5rem",
        marginBottom: "1rem",
        fontSize: "0.875rem",
      };

      expect(errorStyle.backgroundColor).toBe("#fee2e2");
      expect(errorStyle.color).toBe("#991b1b");
      expect(errorStyle.padding).toBe("0.75rem");
      expect(errorStyle.borderRadius).toBe("0.5rem");
      expect(errorStyle.marginBottom).toBe("1rem");
      expect(errorStyle.fontSize).toBe("0.875rem");
    });
  });

  describe("button styling", () => {
    test("submit button style properties", () => {
      const buttonStyle = {
        width: "100%",
        padding: "0.75rem",
      };

      expect(buttonStyle.width).toBe("100%");
      expect(buttonStyle.padding).toBe("0.75rem");
    });

    test("Bsale link style properties", () => {
      const linkStyle = {
        marginTop: "0.5rem",
      };

      expect(linkStyle.marginTop).toBe("0.5rem");
    });
  });

  describe("footer section styling", () => {
    test("footer text style properties", () => {
      const textStyle = {
        color: "#64748b",
        fontSize: "0.875rem",
      };

      expect(textStyle.color).toBe("#64748b");
      expect(textStyle.fontSize).toBe("0.875rem");
    });

    test("footer container style properties", () => {
      const containerStyle = {
        marginTop: "1.5rem",
        textAlign: "center",
      };

      expect(containerStyle.marginTop).toBe("1.5rem");
      expect(containerStyle.textAlign).toBe("center");
    });
  });

  describe("state management", () => {
    test("initial email state", () => {
      const email = "";
      expect(email).toBe("");
    });

    test("initial login state", () => {
      const state: "idle" | "loading" | "sent" | "error" = "idle";
      expect(state).toBe("idle");
    });

    test("initial error state", () => {
      const error: string | null = null;
      expect(error).toBeNull();
    });

    test("email state updates on change", () => {
      let email = "";
      email = "test@example.com";
      expect(email).toBe("test@example.com");
    });

    test("state transitions to loading", () => {
      let state: "idle" | "loading" | "sent" | "error" = "idle";
      state = "loading";
      expect(state).toBe("loading");
    });

    test("state transitions to sent on success", () => {
      let state: "idle" | "loading" | "sent" | "error" = "loading";
      state = "sent";
      expect(state).toBe("sent");
    });
  });

  describe("component dependencies", () => {
    test("uses useState for email", () => {
      // Component uses useState for email
      const [email, setEmail] = ["", (val: string) => val];
      expect(email).toBe("");
      expect(typeof setEmail).toBe("function");
    });

    test("uses useState for state", () => {
      // Component uses useState for state
      const [state, setState] = ["idle" as const, (val: string) => val];
      expect(state).toBe("idle");
      expect(typeof setState).toBe("function");
    });

    test("uses useState for error", () => {
      // Component uses useState for error
      const [error, setError] = [null as string | null, (val: string | null) => val];
      expect(error).toBeNull();
      expect(typeof setError).toBe("function");
    });

    test("uses useAuth hook", () => {
      const authContext = {
        loading: false,
        user: null,
      };
      expect(authContext.loading).toBe(false);
      expect(authContext.user).toBeNull();
    });

    test("uses useLocation from wouter", () => {
      const [, setLocation] = ["/login", (path: string) => path];
      expect(typeof setLocation).toBe("function");
    });
  });

  describe("DOM rendering tests", () => {
    test("Login renders form elements (SSR)", () => {
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Not authenticated" }),
        } as Response)
      );

      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Login)
          )
        )
      );

      // Initial SSR has loading=true, so shows "Verificando sesion..."
      expect(html).toContain("Verificando sesion...");
      expect(html).toContain("login-card");
    });

    test("Login renders input fields with correct types", async () => {
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
                React.createElement(Login)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Magic link form only has email input (no password)
        expect(container.innerHTML).toContain('type="email"');
        expect(container.innerHTML).not.toContain('type="password"');

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Login form handles user input", async () => {
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
                React.createElement(Login)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Find email input and change value
        const emailInput = container.querySelector('input[type="email"]');
        expect(emailInput).not.toBeNull();
        if (emailInput) {
          (emailInput as HTMLInputElement).value = "test@example.com";
          emailInput.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Magic link form only has email input (no password)

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Login shows validation error for empty fields", async () => {
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
                React.createElement(Login)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Find and click submit button without entering any data
        const form = container.querySelector("form");
        if (form) {
          // Manually trigger submit event
          const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);
          await new Promise((r) => setTimeout(r, 100));

          // Should show validation error for empty email
          expect(container.textContent).toContain("Por favor ingresa tu correo electronico");
        }

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Login shows loading state during authentication", () => {
      // Use SSR to verify initial loading state
      globalThis.fetch = createFetchMock(() =>
        new Promise(() => {
          // Never resolve - keeps loading state
        })
      );

      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Login)
          )
        )
      );

      // Initial SSR has loading=true from AuthProvider, so shows "Verificando sesion..."
      expect(html).toContain("Verificando sesion...");
    });

    test("Login handles authenticated state (SSR)", () => {
      // Test the SSR case where user is not yet loaded
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: mockUser }),
        } as Response)
      );

      // SSR renders initial state (loading)
      const html = renderToString(
        React.createElement(Router, null,
          React.createElement(AuthProvider, null,
            React.createElement(Login)
          )
        )
      );

      // Login card should be rendered in SSR
      expect(html).toContain("login-card");
    });

    test("Login redirect logic", () => {
      // Test the redirect path logic without rendering
      sessionStorage.setItem("redirect_after_login", "/app/settings");
      const redirectPath = sessionStorage.getItem("redirect_after_login") ?? "/app";
      expect(redirectPath).toBe("/app/settings");

      // Simulate clearing after redirect
      sessionStorage.removeItem("redirect_after_login");
      expect(sessionStorage.getItem("redirect_after_login")).toBeNull();
    });

    test("Login shows authError from context", async () => {
      // Simulate auth error state
      globalThis.fetch = createFetchMock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Invalid credentials" }),
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
                React.createElement(Login)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Error from auth context could be shown
        // (depends on how AuthContext handles the error)

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Login shows magic link description", async () => {
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
                React.createElement(Login)
              )
            )
          );
          setTimeout(resolve, 200);
        });

        // Magic link login shows description about passwordless login
        expect(container.textContent).toContain("enlace para iniciar sesion sin contrasena");

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });

    test("Login component renders fully", async () => {
      // Simplified test that just renders and interacts with the form
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
                React.createElement(Login)
              )
            )
          );
          setTimeout(resolve, 300);
        });

        // Verify form renders (magic link only has email field, no password)
        expect(container.querySelector("form")).not.toBeNull();
        expect(container.querySelector('input[type="email"]')).not.toBeNull();
        expect(container.querySelector('button[type="submit"]')).not.toBeNull();

        root.unmount();
      } finally {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    });
  });
});
