import type { AuthContext, AuthMiddleware } from "@/api/middleware/auth";
import { AuthenticationError } from "@/api/middleware/auth";
import { withRefreshedCookies } from "@/api/utils/response";
import { jsonWithCors } from "@/api/routes/utils";

/**
 * Type for route handlers that require authentication
 */
export type AuthenticatedHandler = (
  request: Request,
  context: AuthContext
) => Promise<Response> | Response;

/**
 * Creates a higher-order function that wraps route handlers with authentication
 * and automatic session refresh cookie injection.
 *
 * Usage:
 * ```typescript
 * const authedRoute = createAuthedRoute(authMiddleware);
 *
 * const getDashboard = authedRoute(async (req, { userId, tenantId }) => {
 *   const data = await db.getData(userId);
 *   return Response.json(data);
 * });
 * ```
 *
 * The wrapper:
 * 1. Runs auth middleware
 * 2. Checks sliding window (< 3.5 days remaining)
 * 3. Updates DB if refresh needed (done in middleware)
 * 4. Runs handler
 * 5. Automatically injects refreshed cookies into Response
 */
export function createAuthedRoute(authMiddleware: AuthMiddleware) {
  return function authedRoute(handler: AuthenticatedHandler) {
    return async (request: Request): Promise<Response> => {
      try {
        const context = await authMiddleware.authenticate(request);
        const response = await handler(request, context);
        return withRefreshedCookies(response, context.refresh);
      } catch (error) {
        if (error instanceof AuthenticationError) {
          const requestOrigin = request.headers.get("Origin");
          return jsonWithCors(
            { error: "Unauthorized" },
            { status: 401 },
            requestOrigin
          );
        }
        throw error;
      }
    };
  };
}

export type AutoRefreshRouteWrapper = ReturnType<typeof createAuthedRoute>;
