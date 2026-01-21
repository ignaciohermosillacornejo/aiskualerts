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
  unitPrice: number | string | null;
  lastSyncAt: string;
}

export interface Threshold {
  id: string;
  productId: string;
  productName: string;
  minQuantity: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface DashboardStats {
  totalProducts: number;
  activeAlerts: number;
  lowStockProducts: number;
  configuredThresholds: number;
}

export type SyncStatus = "not_connected" | "pending" | "syncing" | "success" | "failed";

export interface TenantSettings {
  companyName: string | null;
  email: string;
  bsaleConnected: boolean;
  syncStatus: SyncStatus;
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
  subscriptionStatus: "none" | "active" | "cancelled" | "past_due";
}

export type UserTenantRole = "owner" | "admin" | "member";

export interface TenantMembership {
  id: string;
  name: string | null;
  bsaleClientCode: string | null;
  role: UserTenantRole;
  syncStatus: SyncStatus;
}

export interface CurrentTenant {
  id: string;
  name: string | null;
  bsaleClientCode: string | null;
  syncStatus: SyncStatus;
}

export interface AuthMeResponse {
  user: User;
  currentTenant: CurrentTenant | null;
  tenants: TenantMembership[];
  role: UserTenantRole | null;
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

export interface LimitInfo {
  plan: "FREE" | "PRO";
  thresholds: {
    current: number;
    max: number | null; // null = unlimited
    remaining: number | null;
    isOverLimit: boolean;
  };
}
