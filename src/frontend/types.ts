// Frontend type definitions

export interface Alert {
  id: string;
  type: "threshold_breach" | "low_velocity";
  productId: string;
  productName: string;
  message: string;
  createdAt: string;
  dismissedAt: string | null;
}

export interface Product {
  id: string;
  bsaleId: number;
  sku: string;
  name: string;
  currentStock: number;
  threshold: number | null;
  lastSyncAt: string;
}

export interface Threshold {
  id: string;
  productId: string;
  productName: string;
  minQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalProducts: number;
  activeAlerts: number;
  lowStockProducts: number;
  configuredThresholds: number;
}

export interface TenantSettings {
  companyName: string;
  email: string;
  bsaleConnected: boolean;
  lastSyncAt: string | null;
  emailNotifications: boolean;
  notificationEmail: string;
  syncFrequency: "hourly" | "daily" | "weekly";
  digestFrequency: "daily" | "weekly" | "none";
  // Billing
  subscriptionStatus: "none" | "active" | "cancelled" | "past_due";
  subscriptionEndsAt: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "viewer";
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
