import type { MercadoPagoClient } from "./mercadopago";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { Tenant } from "@/db/repositories/types";
import { logger } from "@/utils/logger";

export interface SubscriptionServiceDeps {
  mercadoPagoClient: MercadoPagoClient;
  tenantRepo: TenantRepository;
}

/**
 * Service to manage subscription lifecycle and status checks.
 * Handles polling MercadoPago when subscription_ends_at has passed.
 */
export class SubscriptionService {
  constructor(private deps: SubscriptionServiceDeps) {}

  /**
   * Checks if tenant has active subscription access.
   * If subscription_ends_at has passed, polls MercadoPago for current status.
   *
   * @returns true if tenant should have access, false otherwise
   */
  async hasActiveAccess(tenant: Tenant): Promise<boolean> {
    // No subscription ever
    if (!tenant.subscription_id) {
      return false;
    }

    // Active subscription - always has access
    if (tenant.subscription_status === "active") {
      return true;
    }

    // Cancelled but still within paid period
    if (
      tenant.subscription_status === "cancelled" &&
      tenant.subscription_ends_at
    ) {
      const now = new Date();
      if (tenant.subscription_ends_at > now) {
        return true;
      }

      // Grace period expired - check if user resubscribed
      return this.refreshAndCheckAccess(tenant);
    }

    // No active subscription
    return false;
  }

  /**
   * Polls MercadoPago for current subscription status and updates database.
   * Called when subscription_ends_at has passed to check for resubscription.
   */
  private async refreshAndCheckAccess(tenant: Tenant): Promise<boolean> {
    if (!tenant.subscription_id) {
      return false;
    }

    try {
      logger.info("Refreshing subscription status from MercadoPago", {
        tenantId: tenant.id,
        subscriptionId: tenant.subscription_id,
      });

      const status = await this.deps.mercadoPagoClient.getSubscriptionStatus(
        tenant.subscription_id
      );

      if (status.isActive) {
        // User resubscribed! Update database
        await this.deps.tenantRepo.activateSubscription(
          tenant.id,
          tenant.subscription_id
        );
        logger.info("Subscription reactivated", {
          tenantId: tenant.id,
          subscriptionId: tenant.subscription_id,
        });
        return true;
      }

      // Still cancelled - update ends_at if we have new info
      if (status.nextPaymentDate) {
        await this.deps.tenantRepo.updateSubscriptionStatus(
          tenant.subscription_id,
          "cancelled",
          status.nextPaymentDate
        );
      }

      return false;
    } catch (error) {
      logger.error(
        "Failed to refresh subscription status",
        error instanceof Error ? error : new Error(String(error))
      );
      // On error, deny access (fail closed)
      return false;
    }
  }
}
