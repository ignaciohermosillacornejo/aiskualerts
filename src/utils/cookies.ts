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
