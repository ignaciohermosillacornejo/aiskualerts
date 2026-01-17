import {
  handleBsaleConnectStart,
  handleBsaleConnectCallback,
  handleBsaleDisconnect,
  BsaleConnectionError,
  type BsaleConnectionDeps,
} from "../handlers/bsale-connection";
import type { AuthMiddleware } from "../middleware/auth";
import type { CSRFMiddleware } from "../middleware/csrf";
import { logger } from "@/utils/logger";

// Cookie name for storing OAuth state (Bsale doesn't return state in callback)
const BSALE_STATE_COOKIE = "bsale_oauth_state";

export interface BsaleConnectionRoutesConfig {
  authMiddleware: AuthMiddleware;
  csrfMiddleware?: CSRFMiddleware;
}

export function createBsaleConnectionRoutes(
  deps: BsaleConnectionDeps,
  config: BsaleConnectionRoutesConfig
) {
  return {
    /**
     * GET /api/bsale/connect?client_code=xxx
     * Start Bsale OAuth connection for logged-in user
     */
    async connect(request: Request): Promise<Response> {
      try {
        // Require authentication
        const authContext = await config.authMiddleware.authenticate(request);

        const url = new URL(request.url);
        const clientCode = url.searchParams.get("client_code");

        if (!clientCode) {
          return new Response(
            JSON.stringify({ error: "client_code query parameter is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const { authorizationUrl, state } = handleBsaleConnectStart(
          { tenantId: authContext.tenantId, clientCode },
          deps
        );

        // Store state in cookie since Bsale doesn't return it in callback
        // Use httpOnly, secure, sameSite=lax for security
        const isProduction = process.env.NODE_ENV === "production";
        const cookieOptions = [
          `${BSALE_STATE_COOKIE}=${state}`,
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          "Max-Age=600", // 10 minutes expiry
          ...(isProduction ? ["Secure"] : []),
        ].join("; ");

        return new Response(null, {
          status: 302,
          headers: {
            Location: authorizationUrl,
            "Set-Cookie": cookieOptions,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Not authenticated") {
          return new Response(null, {
            status: 302,
            headers: { Location: "/login" },
          });
        }

        logger.error(
          "Bsale connect error",
          error instanceof Error ? error : new Error(String(error))
        );
        return new Response(
          JSON.stringify({ error: "Failed to initiate Bsale connection" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },

    /**
     * GET /api/bsale/callback?code=xxx
     * Handle Bsale OAuth callback for connection flow
     * Note: Bsale doesn't return state in URL, we read it from cookie
     */
    async callback(request: Request): Promise<Response> {
      // Helper to clear the state cookie
      const clearStateCookie = () => {
        const isProduction = process.env.NODE_ENV === "production";
        return [
          `${BSALE_STATE_COOKIE}=`,
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          "Max-Age=0", // Expire immediately
          ...(isProduction ? ["Secure"] : []),
        ].join("; ");
      };

      try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");

        // Read state from cookie (Bsale doesn't return it in URL)
        const cookies = request.headers.get("Cookie") ?? "";
        const stateRegex = new RegExp(`${BSALE_STATE_COOKIE}=([^;]+)`);
        const stateMatch = stateRegex.exec(cookies);
        const state = stateMatch?.[1];

        if (!code) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: "/app/settings?error=missing_code",
              "Set-Cookie": clearStateCookie(),
            },
          });
        }

        if (!state) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: "/app/settings?error=missing_state",
              "Set-Cookie": clearStateCookie(),
            },
          });
        }

        await handleBsaleConnectCallback({ code, state }, deps);

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/app/settings?connected=true",
            "Set-Cookie": clearStateCookie(),
          },
        });
      } catch (error) {
        if (error instanceof BsaleConnectionError) {
          logger.warn("Bsale connection failed", { error: error.message });
          const encodedError = encodeURIComponent(error.message);
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/app/settings?error=${encodedError}`,
              "Set-Cookie": clearStateCookie(),
            },
          });
        }

        logger.error(
          "Bsale callback error",
          error instanceof Error ? error : new Error(String(error))
        );
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/app/settings?error=connection_failed",
            "Set-Cookie": clearStateCookie(),
          },
        });
      }
    },

    /**
     * POST /api/bsale/disconnect
     * Disconnect Bsale from the logged-in user's tenant
     */
    async disconnect(request: Request): Promise<Response> {
      try {
        // Require authentication
        const authContext = await config.authMiddleware.authenticate(request);

        await handleBsaleDisconnect(authContext.tenantId, deps);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Not authenticated") {
          return new Response(
            JSON.stringify({ error: "Not authenticated" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }

        if (error instanceof BsaleConnectionError) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        logger.error(
          "Bsale disconnect error",
          error instanceof Error ? error : new Error(String(error))
        );
        return new Response(
          JSON.stringify({ error: "Failed to disconnect Bsale" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },
  };
}
