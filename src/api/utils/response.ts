import type { SessionRefresh } from "@/api/middleware/auth";
import { createRefreshCookies } from "@/utils/cookies";

/**
 * Wraps a Response with refreshed session/CSRF cookies if refresh is needed
 * This maintains immutable Response semantics while handling sliding window session refresh
 */
export function withRefreshedCookies(
  response: Response,
  refresh?: SessionRefresh,
  isProduction: boolean = process.env.NODE_ENV === "production"
): Response {
  if (!refresh) {
    return response;
  }

  const headers = new Headers(response.headers);
  const cookies = createRefreshCookies(refresh, isProduction);

  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
