import type { MercadoPagoClient } from "./mercadopago";
import type { UserRepository } from "@/db/repositories/user";
import type { User } from "@/db/repositories/types";
import { logger } from "@/utils/logger";

export interface SubscriptionServiceDeps {
  mercadoPagoClient: MercadoPagoClient;
  userRepo: UserRepository;
}

/**
 * Service to manage subscription lifecycle and status checks.
 * Handles polling MercadoPago when subscription_ends_at has passed.
 */
export class SubscriptionService {
  constructor(private deps: SubscriptionServiceDeps) {}

  /**
   * Checks if user has active subscription access.
   * If subscription_ends_at has passed, polls MercadoPago for current status.
   *
   * @returns true if user should have access, false otherwise
   */
  async hasActiveAccess(user: User): Promise<boolean> {
    // No subscription ever
    if (!user.subscription_id) {
      return false;
    }

    // Active subscription - always has access
    if (user.subscription_status === "active") {
      return true;
    }

    // Cancelled but still within paid period
    if (
      user.subscription_status === "cancelled" &&
      user.subscription_ends_at
    ) {
      const now = new Date();
      if (user.subscription_ends_at > now) {
        return true;
      }

      // Grace period expired - check if user resubscribed
      return this.refreshAndCheckAccess(user);
    }

    // No active subscription
    return false;
  }

  /**
   * Polls MercadoPago for current subscription status and updates database.
   * Called when subscription_ends_at has passed to check for resubscription.
   */
  private async refreshAndCheckAccess(user: User): Promise<boolean> {
    if (!user.subscription_id) {
      return false;
    }

    try {
      logger.info("Refreshing subscription status from MercadoPago", {
        userId: user.id,
        subscriptionId: user.subscription_id,
      });

      const status = await this.deps.mercadoPagoClient.getSubscriptionStatus(
        user.subscription_id
      );

      if (status.isActive) {
        // User resubscribed! Update database
        await this.deps.userRepo.activateSubscription(
          user.id,
          user.subscription_id
        );
        logger.info("Subscription reactivated", {
          userId: user.id,
          subscriptionId: user.subscription_id,
        });
        return true;
      }

      // Still cancelled - update ends_at if we have new info
      if (status.nextPaymentDate) {
        await this.deps.userRepo.updateSubscriptionStatus(
          user.subscription_id,
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
