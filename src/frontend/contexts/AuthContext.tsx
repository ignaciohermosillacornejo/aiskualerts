import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { User, CurrentTenant, TenantMembership, UserTenantRole } from "../types";

interface AuthState {
  user: User | null;
  currentTenant: CurrentTenant | null;
  tenants: TenantMembership[];
  role: UserTenantRole | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    currentTenant: null,
    tenants: [],
    role: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const response = await api.getCurrentUser();
      if (response) {
        setState({
          user: response.user,
          currentTenant: response.currentTenant,
          tenants: response.tenants,
          role: response.role,
          loading: false,
          error: null,
        });
      } else {
        setState({
          user: null,
          currentTenant: null,
          tenants: [],
          role: null,
          loading: false,
          error: null,
        });
      }
    } catch {
      setState({
        user: null,
        currentTenant: null,
        tenants: [],
        role: null,
        loading: false,
        error: null,
      });
    }
  }

  async function login(email: string, password: string) {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await api.login({ email, password });
      // After login, fetch full user data including tenants
      await checkSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setState(prev => ({ ...prev, user: null, loading: false, error: message }));
      throw error;
    }
  }

  async function logout() {
    try {
      setState(prev => ({ ...prev, loading: true }));
      await api.logout();
      setState({
        user: null,
        currentTenant: null,
        tenants: [],
        role: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("Logout error:", error);
      setState({
        user: null,
        currentTenant: null,
        tenants: [],
        role: null,
        loading: false,
        error: null,
      });
    }
  }

  async function switchTenant(tenantId: string) {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await api.switchTenant(tenantId);
      // Refresh to get updated currentTenant and role
      await checkSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch tenant";
      setState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }

  async function refreshUser() {
    await checkSession();
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser, switchTenant }}>
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
