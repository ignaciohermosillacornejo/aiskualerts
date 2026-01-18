import {
  handleOAuthStart,
  handleOAuthCallback,
  type OAuthHandlerDeps,
} from "../handlers/oauth";
import { extractSessionToken } from "../../utils/cookies";
import type { CSRFMiddleware } from "../middleware/csrf";
import { logger } from "@/utils/logger";

export interface OAuthRoutesConfig {
  csrfMiddleware?: CSRFMiddleware;
}

export function createOAuthRoutes(deps: OAuthHandlerDeps, config?: OAuthRoutesConfig) {
  return {
    /**
     * GET /api/auth/bsale/start?client_code=xxx
     * Redirects user to Bsale OAuth authorization page
     */
    start(request: Request): Response {
      try {
        const url = new URL(request.url);
        const clientCode = url.searchParams.get("client_code");

        if (!clientCode) {
          return new Response(
            JSON.stringify({
              error: "client_code query parameter is required",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const { authorizationUrl } = handleOAuthStart({ clientCode }, deps);

        return new Response(null, {
          status: 302,
          headers: { Location: authorizationUrl },
        });
      } catch (error) {
        logger.error("OAuth start error", error instanceof Error ? error : new Error(String(error)));
        return new Response(
          JSON.stringify({ error: "Failed to initiate OAuth flow" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },

    /**
     * GET /api/auth/bsale/callback?code=xxx&state=xxx
     * Handles OAuth callback, validates state, creates tenant/user, and sets session cookie
     */
    async callback(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code) {
          return new Response(
            JSON.stringify({ error: "authorization code is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        if (!state) {
          return new Response(
            JSON.stringify({ error: "state parameter is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const sessionData = await handleOAuthCallback({ code, state }, deps);

        // Set session cookie (HTTP-only, Secure in production, SameSite=Strict for CSRF protection)
        const isProduction = process.env.NODE_ENV === "production";
        const maxAge = String(7 * 24 * 60 * 60); // 7 days (sliding window will extend)
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
        logger.error("OAuth callback error", error instanceof Error ? error : new Error(String(error)));
        return new Response(
          JSON.stringify({ error: "Failed to complete OAuth flow" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },

    /**
     * POST /api/auth/logout
     * Clears session cookie and deletes session from database
     */
    async logout(request: Request): Promise<Response> {
      try {
        const cookieHeader = request.headers.get("Cookie");
        if (cookieHeader) {
          const sessionToken = extractSessionToken(cookieHeader);
          if (sessionToken) {
            await deps.sessionRepo.deleteByToken(sessionToken);
          }
        }

        const headers = new Headers({
          Location: "/",
        });

        // Clear session cookie
        headers.append("Set-Cookie", "session_token=; HttpOnly; Path=/; Max-Age=0");

        // Clear CSRF cookie if middleware is configured
        if (config?.csrfMiddleware) {
          const csrfCookieName = config.csrfMiddleware.getCookieName();
          headers.append("Set-Cookie", `${csrfCookieName}=; Path=/; Max-Age=0`);
        }

        return new Response(null, {
          status: 302,
          headers,
        });
      } catch (error) {
        logger.error("Logout error", error instanceof Error ? error : new Error(String(error)));
        return new Response(
          JSON.stringify({ error: "Failed to logout" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },
  };
}
