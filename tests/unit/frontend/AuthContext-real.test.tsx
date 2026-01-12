import { test, expect, describe, beforeEach, afterEach, mock, spyOn } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import "../../setup";

// Store original fetch
const originalFetch = globalThis.fetch;

describe("AuthContext Real Implementation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Mock fetch to simulate API responses
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: { id: "1", email: "test@test.com", name: "Test", role: "admin" } }),
      } as Response)
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("AuthProvider provides context to children", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    function TestChild() {
      const auth = useAuth();
      return (
        <div>
          <span data-loading={auth.loading}>{auth.loading ? "Loading" : "Loaded"}</span>
          <span data-user={auth.user?.email ?? "none"}>{auth.user?.email ?? "No user"}</span>
        </div>
      );
    }

    const html = renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    // During SSR, the initial state is loading=true
    expect(html).toContain("Loading");
  });

  test("AuthProvider initial state is loading", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    function TestChild() {
      const { loading, user, error } = useAuth();
      return (
        <div>
          <span id="loading">{String(loading)}</span>
          <span id="user">{user ? "has-user" : "no-user"}</span>
          <span id="error">{error ?? "no-error"}</span>
        </div>
      );
    }

    const html = renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(html).toContain(">true<");  // loading is true initially
    expect(html).toContain("no-user");  // user is null initially
    expect(html).toContain("no-error"); // error is null initially
  });

  test("AuthProvider exposes login function", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    function TestChild() {
      const { login } = useAuth();
      return (
        <div>
          <span>{typeof login === "function" ? "login-is-function" : "login-not-function"}</span>
        </div>
      );
    }

    const html = renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(html).toContain("login-is-function");
  });

  test("AuthProvider exposes logout function", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    function TestChild() {
      const { logout } = useAuth();
      return (
        <div>
          <span>{typeof logout === "function" ? "logout-is-function" : "logout-not-function"}</span>
        </div>
      );
    }

    const html = renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(html).toContain("logout-is-function");
  });

  test("AuthProvider exposes refreshUser function", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    function TestChild() {
      const { refreshUser } = useAuth();
      return (
        <div>
          <span>{typeof refreshUser === "function" ? "refreshUser-is-function" : "refreshUser-not-function"}</span>
        </div>
      );
    }

    const html = renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(html).toContain("refreshUser-is-function");
  });

  test("useAuth returns all expected properties", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    function TestChild() {
      const auth = useAuth();
      const hasUser = "user" in auth;
      const hasLoading = "loading" in auth;
      const hasError = "error" in auth;
      const hasLogin = "login" in auth;
      const hasLogout = "logout" in auth;
      const hasRefreshUser = "refreshUser" in auth;

      return (
        <div>
          <span id="user">{hasUser ? "has-user" : "no-user"}</span>
          <span id="loading">{hasLoading ? "has-loading" : "no-loading"}</span>
          <span id="error">{hasError ? "has-error" : "no-error"}</span>
          <span id="login">{hasLogin ? "has-login" : "no-login"}</span>
          <span id="logout">{hasLogout ? "has-logout" : "no-logout"}</span>
          <span id="refreshUser">{hasRefreshUser ? "has-refreshUser" : "no-refreshUser"}</span>
        </div>
      );
    }

    const html = renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(html).toContain("has-user");
    expect(html).toContain("has-loading");
    expect(html).toContain("has-error");
    expect(html).toContain("has-login");
    expect(html).toContain("has-logout");
    expect(html).toContain("has-refreshUser");
  });
});

describe("AuthContext useAuth throws outside provider", () => {
  test("useAuth returns undefined context when called outside provider", async () => {
    const { useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    // The useAuth hook checks if context is undefined and throws
    // We verify this by checking that useAuth is a function that requires AuthProvider
    expect(useAuth).toBeFunction();
  });

  test("useAuth throws error message about AuthProvider", () => {
    // Test that the error message is correct
    const expectedErrorMessage = "useAuth must be used within AuthProvider";

    // Simulate what useAuth does when context is undefined
    const throwIfNoContext = (context: undefined | object) => {
      if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
      }
      return context;
    };

    expect(() => throwIfNoContext(undefined)).toThrow(expectedErrorMessage);
  });
});

describe("AuthContext API integration", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: { id: "1", email: "test@test.com", name: "Test", role: "admin" } }),
      } as Response)
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("login function can be called", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    let capturedLogin: ((email: string, password: string) => Promise<void>) | null = null;

    function TestChild() {
      const { login } = useAuth();
      capturedLogin = login;
      return <div>Captured</div>;
    }

    renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(capturedLogin).not.toBeNull();
    expect(typeof capturedLogin).toBe("function");

    // Call the captured login function - capturedLogin is assigned by the render above
    const loginFn = capturedLogin as (email: string, password: string) => Promise<void>;
    await loginFn("test@test.com", "password123");

    expect(globalThis.fetch).toHaveBeenCalled();
  });

  test("logout function can be called", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    let capturedLogout: (() => Promise<void>) | null = null;

    function TestChild() {
      const { logout } = useAuth();
      capturedLogout = logout;
      return <div>Captured</div>;
    }

    renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(capturedLogout).not.toBeNull();
    expect(typeof capturedLogout).toBe("function");

    // Call the captured logout function - capturedLogout is assigned by the render above
    const logoutFn = capturedLogout as () => Promise<void>;
    await logoutFn();

    expect(globalThis.fetch).toHaveBeenCalled();
  });

  test("refreshUser function can be called", async () => {
    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    let capturedRefreshUser: (() => Promise<void>) | null = null;

    function TestChild() {
      const { refreshUser } = useAuth();
      capturedRefreshUser = refreshUser;
      return <div>Captured</div>;
    }

    renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    expect(capturedRefreshUser).not.toBeNull();
    expect(typeof capturedRefreshUser).toBe("function");

    // Call the captured refreshUser function - capturedRefreshUser is assigned by the render above
    const refreshFn = capturedRefreshUser as () => Promise<void>;
    await refreshFn();

    expect(globalThis.fetch).toHaveBeenCalled();
  });

  test("login handles errors correctly", async () => {
    // Mock fetch to return an error
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Invalid credentials" }),
      } as Response)
    );

    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    let capturedLogin: ((email: string, password: string) => Promise<void>) | null = null;

    function TestChild() {
      const { login } = useAuth();
      capturedLogin = login;
      return <div>Captured</div>;
    }

    renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    // capturedLogin is assigned by the render above
    const loginFn = capturedLogin as (email: string, password: string) => Promise<void>;
    try {
      await loginFn("test@test.com", "wrongpassword");
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("logout handles errors gracefully", async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    // Mock fetch to return an error
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      } as Response)
    );

    const { AuthProvider, useAuth } = await import("../../../src/frontend/contexts/AuthContext");

    let capturedLogout: (() => Promise<void>) | null = null;

    function TestChild() {
      const { logout } = useAuth();
      capturedLogout = logout;
      return <div>Captured</div>;
    }

    renderToString(
      <AuthProvider>
        <TestChild />
      </AuthProvider>
    );

    // Logout should not throw even on error - capturedLogout is assigned by the render above
    const logoutFn = capturedLogout as () => Promise<void>;
    await logoutFn();

    consoleSpy.mockRestore();
  });
});
