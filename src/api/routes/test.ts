/**
 * Test-only API routes for E2E browser testing
 * These routes are ONLY available when NODE_ENV !== 'production'
 */

import type { MagicLinkRepository } from "@/db/repositories/magic-link";
import { jsonWithCors } from "./utils";

export interface TestRoutesDeps {
  magicLinkRepo: MagicLinkRepository;
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
  };
}
