// Type definitions for test responses

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "viewer";
}

export interface LoginResponse {
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

export interface ErrorResponse {
  error: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface DashboardStatsResponse {
  totalProducts: number;
  activeAlerts: number;
  lowStockProducts: number;
  configuredThresholds: number;
}
