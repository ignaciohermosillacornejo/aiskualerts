import {
  handleMagicLinkRequest,
  handleMagicLinkVerify,
  MagicLinkError,
  type MagicLinkHandlerDeps,
} from "../handlers/magic-link";
import type { CSRFMiddleware } from "../middleware/csrf";
import { logger } from "@/utils/logger";

export interface MagicLinkRoutesConfig {
  csrfMiddleware?: CSRFMiddleware;
}

export function createMagicLinkRoutes(
  deps: MagicLinkHandlerDeps,
  config?: MagicLinkRoutesConfig
) {
  return {
    /**
     * POST /api/auth/magic-link
     * Request a magic link email
     */
    async request(request: Request): Promise<Response> {
      try {
        const body = (await request.json()) as { email?: string };
        const email = body.email;

        if (!email || typeof email !== "string") {
          return new Response(
            JSON.stringify({ error: "Email is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const result = await handleMagicLinkRequest({ email }, deps);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        logger.error(
          "Magic link request error",
          error instanceof Error ? error : new Error(String(error))
        );
        return new Response(
          JSON.stringify({ error: "Failed to process request" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },

    /**
     * GET /api/auth/magic-link/verify?token=xxx
     * Verify token, create session, redirect to /app
     */
    async verify(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");

        if (!token) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/login?error=invalid_token" },
          });
        }

        const sessionData = await handleMagicLinkVerify({ token }, deps);

        // Set session cookie (HTTP-only, Secure in production, SameSite=Strict)
        const isProduction = process.env.NODE_ENV === "production";
        const maxAge = String(30 * 24 * 60 * 60);
        const cookieParts = [
          `session_token=${sessionData.sessionToken}`,
          "HttpOnly",
          "Path=/",
          `Max-Age=${maxAge}`,
        ];

        if (isProduction) {
          cookieParts.push("Secure", "SameSite=Strict");
        }

        const headers = new Headers({
          Location: "/app",
        });

        // Add session cookie
        headers.append("Set-Cookie", cookieParts.join("; "));

        // Add CSRF cookie if middleware is configured
        if (config?.csrfMiddleware) {
          const csrfToken = config.csrfMiddleware.generateToken();
          const csrfCookie = config.csrfMiddleware.createCookie(csrfToken);
          headers.append("Set-Cookie", csrfCookie);
        }

        return new Response(null, {
          status: 302,
          headers,
        });
      } catch (error) {
        if (error instanceof MagicLinkError) {
          logger.warn("Magic link verification failed", { error: error.message });
          return new Response(null, {
            status: 302,
            headers: { Location: "/login?error=invalid_token" },
          });
        }

        logger.error(
          "Magic link verify error",
          error instanceof Error ? error : new Error(String(error))
        );
        return new Response(null, {
          status: 302,
          headers: { Location: "/login?error=server_error" },
        });
      }
    },
  };
}
