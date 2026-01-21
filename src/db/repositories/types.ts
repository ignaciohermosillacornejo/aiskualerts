export type SubscriptionStatus = "none" | "active" | "cancelled" | "past_due";

export type UserTenantRole = "owner" | "admin" | "member";

export interface UserTenant {
  id: string;
  user_id: string;
  tenant_id: string;
  role: UserTenantRole;
  notification_enabled: boolean;
  notification_email: string | null;
  digest_frequency: DigestFrequency;
  created_at: Date;
}

export interface UserTenantWithTenant extends UserTenant {
  tenant_name: string | null;
  bsale_client_code: string | null;
  sync_status: SyncStatus;
}

export interface Tenant {
  id: string;
  owner_id: string | null;             // User who owns this tenant (null during migration)
  bsale_client_code: string | null;    // NULL if not connected to Bsale
  bsale_client_name: string | null;    // NULL if not connected to Bsale
  bsale_access_token: string | null;   // NULL if not connected to Bsale (encrypted at rest)
  sync_status: SyncStatus;
  last_sync_at: Date | null;
  // Billing (provider-agnostic) - kept for backwards compatibility
  subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Check if a tenant has an active paid subscription
 * Handles grace period for cancelled subscriptions
 */
export function isTenantPaid(tenant: Tenant): boolean {
  if (tenant.subscription_status === "active") return true;
  if (tenant.subscription_status === "cancelled" && tenant.subscription_ends_at) {
    return tenant.subscription_ends_at > new Date();
  }
  return false;
}

export type DigestFrequency = "daily" | "weekly" | "none";

export interface User {
  id: string;
  tenant_id: string;                    // Kept for backwards compatibility
  email: string;
  name: string | null;
  last_tenant_id: string | null;        // Last tenant user was viewing
  notification_enabled: boolean;        // Kept for backwards compatibility (now in user_tenants)
  notification_email: string | null;    // Kept for backwards compatibility (now in user_tenants)
  digest_frequency: DigestFrequency;    // Kept for backwards compatibility (now in user_tenants)
  // Subscription (user-level)
  subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: Date | null;
  created_at: Date;
}

export interface StockSnapshot {
  id: string;
  tenant_id: string;
  bsale_variant_id: number;
  bsale_office_id: number | null;
  sku: string | null;
  barcode: string | null;
  product_name: string | null;
  quantity: number;
  quantity_reserved: number;
  quantity_available: number;
  unit_price: number | null;
  snapshot_date: Date;
  created_at: Date;
}

export interface StockSnapshotInput {
  tenant_id: string;
  bsale_variant_id: number;
  bsale_office_id: number | null;
  sku: string | null;
  barcode: string | null;
  product_name: string | null;
  quantity: number;
  quantity_reserved: number;
  quantity_available: number;
  unit_price: number | null;
  snapshot_date: Date;
}

export interface Threshold {
  id: string;
  tenant_id: string;
  user_id: string;                      // Kept for backwards compatibility
  created_by: string | null;            // User who created this threshold
  bsale_variant_id: number | null;
  bsale_office_id: number | null;
  min_quantity: number;
  days_warning: number;
  created_at: Date;
  updated_at: Date;
}

export interface Alert {
  id: string;
  tenant_id: string;
  user_id: string;                      // Kept for backwards compatibility
  dismissed_by: string | null;          // User who dismissed this alert
  bsale_variant_id: number;
  bsale_office_id: number | null;
  sku: string | null;
  product_name: string | null;
  alert_type: "low_stock" | "out_of_stock" | "low_velocity";
  current_quantity: number;
  threshold_quantity: number | null;
  days_to_stockout: number | null;
  status: "pending" | "sent" | "dismissed";
  sent_at: Date | null;
  created_at: Date;
}

export interface AlertInput {
  tenant_id: string;
  user_id: string;
  bsale_variant_id: number;
  bsale_office_id: number | null;
  sku: string | null;
  product_name: string | null;
  alert_type: "low_stock" | "out_of_stock" | "low_velocity";
  current_quantity: number;
  threshold_quantity: number | null;
  days_to_stockout: number | null;
}

export type SyncStatus = "not_connected" | "pending" | "syncing" | "success" | "failed";

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface Session {
  id: string;
  userId: string;
  currentTenantId: string | null;       // Currently active tenant for this session
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface MagicLinkToken {
  id: string;
  email: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}
