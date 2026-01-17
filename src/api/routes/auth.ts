import { z } from "zod";
import { jsonWithCors, createValidationErrorResponse } from "./utils";
import type { SessionRepository } from "@/db/repositories/session";
import type { UserRepository } from "@/db/repositories/user";
import { extractSessionToken } from "@/utils/cookies";

// Zod schema for login
export const LoginSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export interface AuthRouteDeps {
  sessionRepo?: SessionRepository | undefined;
  userRepo?: UserRepository | undefined;
}

export interface AuthRoutes {
  "/api/auth/login": {
    POST: (req: Request) => Promise<Response>;
  };
  "/api/auth/logout": {
    POST: (req: Request) => Response;
  };
  "/api/auth/me": {
    GET: (req: Request) => Promise<Response>;
  };
}

export function createAuthRoutes(deps: AuthRouteDeps = {}): AuthRoutes {
  return {
    "/api/auth/login": {
      POST: async (req) => {
        const parseResult = LoginSchema.safeParse(await req.json());
        if (!parseResult.success) {
          return createValidationErrorResponse(parseResult.error);
        }
        const body = parseResult.data;
        // Mock login - always succeeds for demo
        const isProduction = process.env.NODE_ENV === "production";
        const maxAge = 30 * 24 * 60 * 60; // 30 days
        const sessionToken = `mock_${String(Date.now())}_${Math.random().toString(36)}`;

        const cookieParts = [
          `session_token=${sessionToken}`,
          "HttpOnly",
          "Path=/",
          `Max-Age=${String(maxAge)}`,
        ];

        if (isProduction) {
          cookieParts.push("Secure", "SameSite=Strict");
        }

        return jsonWithCors(
          {
            user: {
              id: "u1",
              email: body.email,
              name: "Usuario Demo",
              role: "admin" as const,
            },
          },
          {
            headers: {
              "Set-Cookie": cookieParts.join("; "),
            },
          }
        );
      },
    },

    "/api/auth/logout": {
      POST: () =>
        jsonWithCors(
          { success: true },
          {
            headers: {
              "Set-Cookie": "session_token=; HttpOnly; Path=/; Max-Age=0",
            },
          }
        ),
    },

    "/api/auth/me": {
      GET: async (req) => {
        const cookie = req.headers.get("Cookie") ?? "";
        const sessionToken = extractSessionToken(cookie);

        if (!sessionToken) {
          return jsonWithCors({ user: null }, { status: 401 });
        }

        // If we have repositories, use real session/user lookup
        if (deps.sessionRepo && deps.userRepo) {
          const session = await deps.sessionRepo.findByToken(sessionToken);
          if (!session) {
            return jsonWithCors({ user: null }, { status: 401 });
          }

          const user = await deps.userRepo.getById(session.userId);
          if (!user) {
            return jsonWithCors({ user: null }, { status: 401 });
          }

          return jsonWithCors({
            user: {
              id: user.id,
              email: user.email,
              name: user.name ?? "Usuario",
              role: "admin" as const,
            },
          });
        }

        // Fallback to mock data for testing/development without DB
        return jsonWithCors({
          user: {
            id: "u1",
            email: "demo@empresa.cl",
            name: "Usuario Demo",
            role: "admin" as const,
          },
        });
      },
    },
  };
}
