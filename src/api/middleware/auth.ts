import type { SessionRepository } from "../../db/repositories/session";
import type { UserRepository } from "../../db/repositories/user";
import { extractSessionToken } from "../../utils/cookies";

export interface AuthContext {
  userId: string;
  tenantId: string;
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

      return {
        userId: user.id,
        tenantId: user.tenant_id,
      };
    },
  };
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}
