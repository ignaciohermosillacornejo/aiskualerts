import type { SessionRepository } from "../../db/repositories/session";
import type { UserRepository } from "../../db/repositories/user";
import { extractSessionToken, SESSION_TTL_DAYS, SESSION_REFRESH_THRESHOLD_DAYS } from "../../utils/cookies";
import { extractCSRFTokenFromCookie } from "../../utils/csrf";

export interface SessionRefresh {
  sessionToken: string;  // Same token, new Max-Age
  csrfToken: string;     // Same token, new Max-Age
  expiresAt: Date;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  refresh?: SessionRefresh;  // Present if refresh needed
}

export interface AuthMiddleware {
  authenticate: (request: Request) => Promise<AuthContext>;
}

export function createAuthMiddleware(
  sessionRepo: SessionRepository,
  userRepo: UserRepository
): AuthMiddleware {
  return {
    async authenticate(request: Request): Promise<AuthContext> {
      // Extract session token from cookie
      const cookieHeader = request.headers.get("Cookie");
      if (!cookieHeader) {
        throw new AuthenticationError("No session cookie found");
      }

      const sessionToken = extractSessionToken(cookieHeader);
      if (!sessionToken) {
        throw new AuthenticationError("Invalid session cookie");
      }

      // Validate session
      const session = await sessionRepo.findByToken(sessionToken);
      if (!session) {
        throw new AuthenticationError("Invalid or expired session");
      }

      // Get user to retrieve tenant_id
      const user = await userRepo.getById(session.userId);
      if (!user) {
        throw new AuthenticationError("User not found");
      }

      const baseContext = {
        userId: user.id,
        tenantId: user.tenant_id,
      };

      // Check sliding window - refresh if less than threshold days remaining
      const now = Date.now();
      const expiresAt = session.expiresAt.getTime();
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

      if (daysUntilExpiry < SESSION_REFRESH_THRESHOLD_DAYS) {
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_TTL_DAYS);

        // Update session expiration in DB
        await sessionRepo.refreshSession(sessionToken, newExpiresAt);

        // Get existing CSRF token from COOKIE (not header!)
        // Cookie = persistent value, Header = what frontend sends for validation
        // On GET requests, header may be empty but cookie exists
        const csrfToken = extractCSRFTokenFromCookie(cookieHeader, "csrf_token");

        return {
          ...baseContext,
          refresh: {
            sessionToken: sessionToken,
            csrfToken: csrfToken ?? "",
            expiresAt: newExpiresAt,
          },
        };
      }

      return baseContext;
    },
  };
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}
