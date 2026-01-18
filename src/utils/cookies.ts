import type { SessionRefresh } from "@/api/middleware/auth";

export const SESSION_TTL_DAYS = 7;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60; // 7 days
export const SESSION_REFRESH_THRESHOLD_DAYS = 3.5;

/**
 * Extract session token from cookie header
 */
export function extractSessionToken(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(";").map((c) => c.trim());

  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === "session_token") {
      return value ?? null;
    }
  }

  return null;
}

/**
 * Create Set-Cookie headers to refresh session and CSRF tokens
 * Both cookies get the same Max-Age (7 days) but keep their existing token values
 */
export function createRefreshCookies(refresh: SessionRefresh, isProduction: boolean): string[] {
  const cookies: string[] = [];

  // Session cookie (HttpOnly)
  const sessionCookieParts = [
    `session_token=${refresh.sessionToken}`,
    "Path=/",
    `Max-Age=${String(SESSION_TTL_SECONDS)}`,
    "HttpOnly",
  ];

  if (isProduction) {
    sessionCookieParts.push("SameSite=Strict", "Secure");
  } else {
    sessionCookieParts.push("SameSite=Lax");
  }

  cookies.push(sessionCookieParts.join("; "));

  // CSRF cookie (readable by JavaScript for double-submit pattern)
  if (refresh.csrfToken) {
    const csrfCookieParts = [
      `csrf_token=${refresh.csrfToken}`,
      "Path=/",
      `Max-Age=${String(SESSION_TTL_SECONDS)}`,
      "SameSite=Strict",
    ];

    if (isProduction) {
      csrfCookieParts.push("Secure");
    }

    cookies.push(csrfCookieParts.join("; "));
  }

  return cookies;
}
