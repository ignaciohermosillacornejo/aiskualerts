/**
 * Test-only API routes for E2E browser testing
 * These routes are ONLY available when NODE_ENV !== 'production'
 */

import type { MagicLinkRepository } from "@/db/repositories/magic-link";
import type { DailyConsumptionRepository } from "@/db/repositories/daily-consumption";
import { jsonWithCors } from "./utils";

export interface TestRoutesDeps {
  magicLinkRepo: MagicLinkRepository;
  consumptionRepo?: DailyConsumptionRepository;
}

export function createTestRoutes(deps: TestRoutesDeps) {
  // Safety check: refuse to create test routes in production
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test routes cannot be created in production environment");
  }

  return {
    /**
     * GET /api/test/magic-link-token?email=xxx
     * Returns the most recent unused magic link token for an email
     * Used by Playwright E2E tests to bypass email verification
     */
    async getMagicLinkToken(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const email = url.searchParams.get("email");
      const requestOrigin = request.headers.get("Origin");

      if (!email) {
        return jsonWithCors(
          { error: "Email parameter is required" },
          { status: 400 },
          requestOrigin
        );
      }

      // Query the database for the most recent valid token
      const token = await deps.magicLinkRepo.findLatestValidTokenByEmail(email);

      if (!token) {
        return jsonWithCors(
          { error: "No valid token found for this email" },
          { status: 404 },
          requestOrigin
        );
      }

      return jsonWithCors({ token: token.token }, undefined, requestOrigin);
    },

    /**
     * POST /api/test/seed-consumption
     * Seeds daily_consumption rows for E2E testing of velocity/days-remaining
     * Body: { tenantId, variantId, officeId?, days, dailyQuantity }
     */
    async seedConsumption(request: Request): Promise<Response> {
      const requestOrigin = request.headers.get("Origin");

      if (!deps.consumptionRepo) {
        return jsonWithCors(
          { error: "Consumption repo not available" },
          { status: 503 },
          requestOrigin
        );
      }

      const body = (await request.json()) as {
        tenantId: string;
        variantId: number;
        officeId?: number | null;
        days: number;
        dailyQuantity: number;
      };

      if (!body.tenantId || !body.variantId || !body.days || !body.dailyQuantity) {
        return jsonWithCors(
          { error: "Missing required fields: tenantId, variantId, days, dailyQuantity" },
          { status: 400 },
          requestOrigin
        );
      }

      const inputs = [];
      const now = new Date();
      for (let i = 1; i <= body.days; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        inputs.push({
          tenantId: body.tenantId,
          bsaleVariantId: body.variantId,
          bsaleOfficeId: body.officeId ?? null,
          consumptionDate: date,
          quantitySold: body.dailyQuantity,
          documentCount: 1,
        });
      }

      const count = await deps.consumptionRepo.upsertBatch(inputs);

      return jsonWithCors({ seeded: count }, undefined, requestOrigin);
    },
  };
}
