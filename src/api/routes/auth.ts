import { z } from "zod";
import { jsonWithCors, createValidationErrorResponse } from "./utils";

// Zod schema for login
export const LoginSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export interface AuthRoutes {
  "/api/auth/login": {
    POST: (req: Request) => Promise<Response>;
  };
  "/api/auth/logout": {
    POST: (req: Request) => Response;
  };
  "/api/auth/me": {
    GET: (req: Request) => Response;
  };
}

export function createAuthRoutes(): AuthRoutes {
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
      GET: (req) => {
        const cookie = req.headers.get("Cookie") ?? "";
        if (!cookie.includes("session_token=")) {
          return jsonWithCors({ user: null }, { status: 401 });
        }
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
