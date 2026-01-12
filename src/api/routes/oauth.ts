import { handleOAuthStart, handleOAuthCallback, type OAuthHandlerDeps } from "../handlers/oauth";

export function createOAuthRoutes(deps: OAuthHandlerDeps) {
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
            JSON.stringify({ error: "client_code query parameter is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const authUrl = handleOAuthStart({ clientCode }, deps);

        return new Response(null, {
          status: 302,
          headers: { Location: authUrl },
        });
      } catch (error) {
        console.error("OAuth start error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to initiate OAuth flow" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },

    /**
     * GET /api/auth/bsale/callback?code=xxx
     * Handles OAuth callback, creates tenant/user, and sets session cookie
     */
    async callback(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");

        if (!code) {
          return new Response(
            JSON.stringify({ error: "authorization code is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const sessionData = await handleOAuthCallback({ code }, deps);

        // Set session cookie (HTTP-only, Secure in production)
        const isProduction = process.env.NODE_ENV === "production";
        const maxAge = String(30 * 24 * 60 * 60);
        const cookieValue = `session_token=${sessionData.sessionToken}; HttpOnly; Path=/; Max-Age=${maxAge}${isProduction ? "; Secure; SameSite=Lax" : ""}`;

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/app",
            "Set-Cookie": cookieValue,
          },
        });
      } catch (error) {
        console.error("OAuth callback error:", error);
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

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/",
            "Set-Cookie": "session_token=; HttpOnly; Path=/; Max-Age=0",
          },
        });
      } catch (error) {
        console.error("Logout error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to logout" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },
  };
}

function extractSessionToken(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(";").map((c) => c.trim());

  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === "session_token") {
      return value ?? null;
    }
  }

  return null;
}
