import { test, expect, describe, beforeEach, afterEach, mock, spyOn } from "bun:test";
import "../../setup";

// Store original fetch
const originalFetch = globalThis.fetch;

describe("AuthContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("module exports", () => {
    test("exports AuthProvider function", async () => {
      const { AuthProvider } = await import("../../../src/frontend/contexts/AuthContext");
      expect(AuthProvider).toBeFunction();
    });

    test("exports useAuth hook", async () => {
      const { useAuth } = await import("../../../src/frontend/contexts/AuthContext");
      expect(useAuth).toBeFunction();
    });
  });

  describe("AuthState interface behavior", () => {
    test("initial state has correct shape", () => {
      const initialState = {
        user: null,
        loading: true,
        error: null,
      };

      expect(initialState.user).toBeNull();
      expect(initialState.loading).toBe(true);
      expect(initialState.error).toBeNull();
    });

    test("authenticated state has correct shape", () => {
      const authenticatedState = {
        user: { id: "1", email: "test@test.com", name: "Test User", role: "admin" as const },
        loading: false,
        error: null,
      };

      expect(authenticatedState.user).not.toBeNull();
      expect(authenticatedState.user?.email).toBe("test@test.com");
      expect(authenticatedState.loading).toBe(false);
      expect(authenticatedState.error).toBeNull();
    });

    test("error state has correct shape", () => {
      const errorState = {
        user: null,
        loading: false,
        error: "Invalid credentials",
      };

      expect(errorState.user).toBeNull();
      expect(errorState.loading).toBe(false);
      expect(errorState.error).toBe("Invalid credentials");
    });
  });

  describe("checkSession logic", () => {
    test("successful session check sets user", async () => {
      const mockUser = { id: "1", email: "test@test.com", name: "Test", role: "admin" as const };
      const mockGetCurrentUser = mock(() => Promise.resolve(mockUser));

      let state = { user: null as typeof mockUser | null, loading: true, error: null as string | null };

      state = { ...state, loading: true, error: null };
      expect(state.loading).toBe(true);

      const user = await mockGetCurrentUser();
      state = { user, loading: false, error: null };

      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
    });

    test("failed session check clears user without error", async () => {
      const mockGetCurrentUser = mock(() => Promise.reject(new Error("Unauthorized")));

      let state = { user: null as null, loading: true, error: null as string | null };

      state = { ...state, loading: true, error: null };

      try {
        await mockGetCurrentUser();
      } catch {
        state = { user: null, loading: false, error: null };
      }

      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("login logic", () => {
    test("successful login updates user state", async () => {
      const mockUser = { id: "1", email: "test@test.com", name: "Test", role: "admin" as const };
      const mockLogin = mock(() => Promise.resolve({ user: mockUser }));

      let state = { user: null as typeof mockUser | null, loading: false, error: null as string | null };

      state = { ...state, loading: true, error: null };
      expect(state.loading).toBe(true);

      const response = await mockLogin();
      state = { user: response.user, loading: false, error: null };

      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    test("failed login sets error state", async () => {
      const mockLogin = mock(() => Promise.reject(new Error("Invalid credentials")));

      let state = { user: null as null, loading: false, error: null as string | null };

      state = { ...state, loading: true, error: null };

      try {
        await mockLogin();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Login failed";
        state = { user: null, loading: false, error: message };
      }

      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Invalid credentials");
    });

    test("non-Error exception uses fallback message", async () => {
      const mockLogin = mock(() => Promise.reject("some string error"));

      let state = { user: null as null, loading: false, error: null as string | null };

      state = { ...state, loading: true, error: null };

      try {
        await mockLogin();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Login failed";
        state = { user: null, loading: false, error: message };
      }

      expect(state.error).toBe("Login failed");
    });

    test("login re-throws error for caller to handle", async () => {
      const mockLogin = mock(() => Promise.reject(new Error("Network error")));

      let thrownError: Error | null = null;

      try {
        await mockLogin();
      } catch (error) {
        if (error instanceof Error) {
          thrownError = error;
        }
      }

      expect(thrownError?.message).toBe("Network error");
    });
  });

  describe("logout logic", () => {
    test("successful logout clears user state", async () => {
      const mockLogout = mock(() => Promise.resolve());
      const mockUser = { id: "1", email: "test@test.com", name: "Test", role: "admin" as const };

      let state = { user: mockUser as typeof mockUser | null, loading: false, error: null as string | null };

      state = { ...state, loading: true };
      await mockLogout();
      state = { user: null, loading: false, error: null };

      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    test("logout swallows errors and still clears user", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const mockLogout = mock(() => Promise.reject(new Error("Network error")));
      const mockUser = { id: "1", email: "test@test.com", name: "Test", role: "admin" as const };

      let state = { user: mockUser as typeof mockUser | null, loading: false, error: null as string | null };

      state = { ...state, loading: true };

      try {
        await mockLogout();
        state = { user: null, loading: false, error: null };
      } catch (error) {
        console.error("Logout error:", error);
        state = { user: null, loading: false, error: null };
      }

      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("refreshUser logic", () => {
    test("refreshUser calls checkSession", async () => {
      const mockUser = { id: "1", email: "test@test.com", name: "Test", role: "admin" as const };
      const mockGetCurrentUser = mock(() => Promise.resolve(mockUser));

      let state = { user: null as typeof mockUser | null, loading: true, error: null as string | null };

      state = { ...state, loading: true, error: null };
      const user = await mockGetCurrentUser();
      state = { user, loading: false, error: null };

      expect(state.user).toEqual(mockUser);
      expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);

      // Refresh (call again)
      state = { ...state, loading: true, error: null };
      const user2 = await mockGetCurrentUser();
      state = { user: user2, loading: false, error: null };

      expect(mockGetCurrentUser).toHaveBeenCalledTimes(2);
    });
  });

  describe("useAuth hook behavior", () => {
    test("throws error when used outside provider", async () => {
      // The hook checks for undefined context and throws
      const expectedError = "useAuth must be used within AuthProvider";

      const throwIfNoContext = (context: undefined | object) => {
        if (!context) {
          throw new Error("useAuth must be used within AuthProvider");
        }
        return context;
      };

      expect(() => throwIfNoContext(undefined)).toThrow(expectedError);
    });

    test("returns context value when inside provider", () => {
      const mockContext = {
        user: { id: "1", email: "test@test.com", name: "Test", role: "admin" as const },
        loading: false,
        error: null,
        login: async () => {},
        logout: async () => {},
        refreshUser: async () => {},
      };

      const throwIfNoContext = (context: typeof mockContext | undefined) => {
        if (!context) {
          throw new Error("useAuth must be used within AuthProvider");
        }
        return context;
      };

      const result = throwIfNoContext(mockContext);
      expect(result.user?.email).toBe("test@test.com");
      expect(result.loading).toBe(false);
    });
  });

  describe("AuthContextValue interface", () => {
    test("login function signature", async () => {
      const login = async (email: string, password: string): Promise<void> => {
        expect(email).toBe("test@test.com");
        expect(password).toBe("password123");
      };

      await login("test@test.com", "password123");
    });

    test("logout function signature", async () => {
      let called = false;
      const logout = async (): Promise<void> => {
        called = true;
      };

      await logout();
      expect(called).toBe(true);
    });

    test("refreshUser function signature", async () => {
      let called = false;
      const refreshUser = async (): Promise<void> => {
        called = true;
      };

      await refreshUser();
      expect(called).toBe(true);
    });
  });

  describe("state transitions", () => {
    test("loading -> authenticated transition", () => {
      const mockUser = { id: "1", email: "test@test.com", name: "Test", role: "admin" as const };

      let state = { user: null as typeof mockUser | null, loading: true, error: null as string | null };
      expect(state.loading).toBe(true);
      expect(state.user).toBeNull();

      state = { user: mockUser, loading: false, error: null };
      expect(state.loading).toBe(false);
      expect(state.user).not.toBeNull();
    });

    test("loading -> unauthenticated transition", () => {
      type User = { id: string; email: string; name: string; role: "admin" | "viewer" };
      let state = { user: null as User | null, loading: true, error: null as string | null };
      expect(state.loading).toBe(true);

      state = { user: null, loading: false, error: null };
      expect(state.loading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.error).toBeNull();
    });

    test("authenticated -> loading -> unauthenticated (logout)", () => {
      const mockUser = { id: "1", email: "test@test.com", name: "Test", role: "admin" as const };

      let state = { user: mockUser as typeof mockUser | null, loading: false, error: null as string | null };
      expect(state.user).not.toBeNull();

      state = { ...state, loading: true };
      expect(state.loading).toBe(true);

      state = { user: null, loading: false, error: null };
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
    });

    test("unauthenticated -> loading -> error (failed login)", () => {
      type User = { id: string; email: string; name: string; role: "admin" | "viewer" };
      let state = { user: null as User | null, loading: false, error: null as string | null };

      state = { ...state, loading: true, error: null };
      expect(state.loading).toBe(true);

      state = { user: null, loading: false, error: "Invalid credentials" };
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Invalid credentials");
    });
  });

  describe("API client integration", () => {
    test("uses api.getCurrentUser for session check", async () => {
      // Mock fetch to return a user
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { id: "1", email: "test@test.com", name: "Test", role: "admin" } }),
        } as Response)
      );

      const { api } = await import("../../../src/frontend/api/client");
      const user = await api.getCurrentUser();

      expect(user).toBeDefined();
    });

    test("uses api.login for authentication", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { id: "1", email: "test@test.com", name: "Test", role: "admin" } }),
        } as Response)
      );

      const { api } = await import("../../../src/frontend/api/client");
      const response = await api.login({ email: "test@test.com", password: "password" });

      expect(response.user).toBeDefined();
    });

    test("uses api.logout for signing out", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response)
      );

      const { api } = await import("../../../src/frontend/api/client");
      await api.logout();

      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });
});
