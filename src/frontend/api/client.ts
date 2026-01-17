import { z } from "zod";
import type {
  Alert,
  Product,
  Threshold,
  DashboardStats,
  TenantSettings,
  LoginCredentials,
} from "../types";

const API_BASE = "/api";

// Zod schemas for input validation
const ThresholdInputSchema = z.object({
  productId: z.string().min(1, "Product ID is required").max(100),
  minQuantity: z.number().int().min(0, "Quantity must be non-negative").max(1000000),
});

const LoginCredentialsSchema = z.object({
  email: z.email("Invalid email format").max(255),
  password: z.string().min(1, "Password is required").max(255),
});

const MagicLinkRequestSchema = z.object({
  email: z.email("Invalid email format").max(255),
});

const SettingsUpdateSchema = z.object({
  emailNotifications: z.boolean().optional(),
  notificationEmail: z.email().max(255).optional(),
  syncFrequency: z.enum(["hourly", "daily", "weekly"]).optional(),
}).partial();

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";

/**
 * Extract CSRF token from cookies
 */
function getCSRFToken(): string | null {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === CSRF_COOKIE_NAME) {
      return valueParts.join("=") || null;
    }
  }
  return null;
}

/**
 * HTTP methods that require CSRF token
 */
const STATE_CHANGING_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  // Add CSRF token for state-changing requests
  const method = options.method?.toUpperCase() ?? "GET";
  if (STATE_CHANGING_METHODS.includes(method)) {
    const csrfToken = getCSRFToken();
    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

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
  status?: "pending" | "sent" | "dismissed";
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
  if (options.status) params.set("status", options.status);
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
  // Validate input before sending to server
  const validated = ThresholdInputSchema.parse(data);
  return request<Threshold>("/thresholds", {
    method: "POST",
    body: JSON.stringify(validated),
  });
}

async function updateThreshold(
  thresholdId: string,
  data: ThresholdInput
): Promise<Threshold> {
  // Validate input before sending to server
  const validated = ThresholdInputSchema.parse(data);
  if (!thresholdId || thresholdId.length > 100) {
    throw new Error("Invalid threshold ID");
  }
  return request<Threshold>(`/thresholds/${thresholdId}`, {
    method: "PUT",
    body: JSON.stringify(validated),
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
  // Validate input before sending to server
  const validated = SettingsUpdateSchema.parse(settings);
  return request<TenantSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(validated),
  });
}

// Auth
interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: "admin" | "viewer";
  };
}

async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  // Validate input before sending to server
  const validated = LoginCredentialsSchema.parse(credentials);
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(validated),
  });
}

async function logout(): Promise<void> {
  await request("/auth/logout", { method: "POST" });
}

// Magic link auth
interface MagicLinkRequestResponse {
  success: boolean;
  message: string;
}

async function requestMagicLink(email: string): Promise<MagicLinkRequestResponse> {
  const validated = MagicLinkRequestSchema.parse({ email });
  return request<MagicLinkRequestResponse>("/auth/magic-link", {
    method: "POST",
    body: JSON.stringify(validated),
  });
}

// Bsale connection
async function disconnectBsale(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/bsale/disconnect", { method: "POST" });
}

async function getCurrentUser(): Promise<LoginResponse["user"] | null> {
  try {
    const response = await request<{ user: LoginResponse["user"] }>("/auth/me");
    return response.user;
  } catch {
    return null;
  }
}

// Billing
interface CheckoutResponse {
  url: string;
}

interface CancelSubscriptionResponse {
  message: string;
  endsAt: string;
}

async function createCheckoutSession(): Promise<CheckoutResponse> {
  return request<CheckoutResponse>("/billing/checkout", { method: "POST" });
}

async function cancelSubscription(): Promise<CancelSubscriptionResponse> {
  return request<CancelSubscriptionResponse>("/billing/cancel", { method: "POST" });
}

// Sync
interface SyncTriggerResponse {
  success: boolean;
  productsUpdated: number;
  alertsGenerated: number;
  duration: number;
  error?: string;
}

async function triggerSync(): Promise<SyncTriggerResponse> {
  return request<SyncTriggerResponse>("/sync/trigger", { method: "POST" });
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
  requestMagicLink,
  disconnectBsale,

  // Billing
  createCheckoutSession,
  cancelSubscription,

  // Sync
  triggerSync,
};

export { ApiError };
