import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const user = await api.getCurrentUser();
      setState({ user, loading: false, error: null });
    } catch {
      setState({ user: null, loading: false, error: null });
    }
  }

  async function login(email: string, password: string) {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const response = await api.login({ email, password });
      setState({ user: response.user, loading: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setState({ user: null, loading: false, error: message });
      throw error;
    }
  }

  async function logout() {
    try {
      setState(prev => ({ ...prev, loading: true }));
      await api.logout();
      setState({ user: null, loading: false, error: null });
    } catch (error) {
      console.error("Logout error:", error);
      setState({ user: null, loading: false, error: null });
    }
  }

  async function refreshUser() {
    await checkSession();
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
