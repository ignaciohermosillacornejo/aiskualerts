import type {
  Alert,
  Product,
  Threshold,
  DashboardStats,
  TenantSettings,
  LoginCredentials,
} from "../types";

const API_BASE = "/api";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  // Merge in any additional headers from options
  if (options.headers) {
    const optHeaders = options.headers instanceof Headers
      ? options.headers
      : new Headers(options.headers as HeadersInit);
    optHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(
      errorData.error ?? `HTTP error ${response.status}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

// Dashboard
async function getDashboardStats(): Promise<DashboardStats> {
  return request<DashboardStats>("/dashboard/stats");
}

// Alerts
interface GetAlertsOptions {
  type?: "threshold_breach" | "low_velocity";
  limit?: number;
  offset?: number;
}

interface GetAlertsResponse {
  alerts: Alert[];
  total: number;
}

async function getAlerts(options: GetAlertsOptions = {}): Promise<GetAlertsResponse> {
  const params = new URLSearchParams();
  if (options.type) params.set("type", options.type);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  const query = params.toString();
  return request<GetAlertsResponse>(`/alerts${query ? `?${query}` : ""}`);
}

async function dismissAlert(alertId: string): Promise<void> {
  await request(`/alerts/${alertId}/dismiss`, { method: "POST" });
}

// Products
interface GetProductsResponse {
  products: Product[];
  total: number;
}

async function getProducts(): Promise<GetProductsResponse> {
  return request<GetProductsResponse>("/products");
}

async function getProduct(productId: string): Promise<Product> {
  return request<Product>(`/products/${productId}`);
}

// Thresholds
interface GetThresholdsResponse {
  thresholds: Threshold[];
  total: number;
}

interface ThresholdInput {
  productId: string;
  minQuantity: number;
}

async function getThresholds(): Promise<GetThresholdsResponse> {
  return request<GetThresholdsResponse>("/thresholds");
}

async function createThreshold(data: ThresholdInput): Promise<Threshold> {
  return request<Threshold>("/thresholds", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function updateThreshold(
  thresholdId: string,
  data: ThresholdInput
): Promise<Threshold> {
  return request<Threshold>(`/thresholds/${thresholdId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

async function deleteThreshold(thresholdId: string): Promise<void> {
  await request(`/thresholds/${thresholdId}`, { method: "DELETE" });
}

// Settings
async function getSettings(): Promise<TenantSettings> {
  return request<TenantSettings>("/settings");
}

async function updateSettings(settings: Partial<TenantSettings>): Promise<TenantSettings> {
  return request<TenantSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// Auth
interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

async function logout(): Promise<void> {
  await request("/auth/logout", { method: "POST" });
}

async function getCurrentUser(): Promise<LoginResponse["user"] | null> {
  try {
    const response = await request<{ user: LoginResponse["user"] }>("/auth/me");
    return response.user;
  } catch {
    return null;
  }
}

// Export API client
export const api = {
  // Dashboard
  getDashboardStats,

  // Alerts
  getAlerts,
  dismissAlert,

  // Products
  getProducts,
  getProduct,

  // Thresholds
  getThresholds,
  createThreshold,
  updateThreshold,
  deleteThreshold,

  // Settings
  getSettings,
  updateSettings,

  // Auth
  login,
  logout,
  getCurrentUser,
};

export { ApiError };
