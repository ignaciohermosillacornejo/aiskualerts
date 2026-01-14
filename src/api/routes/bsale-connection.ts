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

        const { authorizationUrl } = handleBsaleConnectStart(
          { tenantId: authContext.tenantId, clientCode },
          deps
        );

        return new Response(null, {
          status: 302,
          headers: { Location: authorizationUrl },
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
     * GET /api/bsale/callback?code=xxx&state=xxx
     * Handle Bsale OAuth callback for connection flow
     */
    async callback(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/app/settings?error=missing_code" },
          });
        }

        if (!state) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/app/settings?error=missing_state" },
          });
        }

        await handleBsaleConnectCallback({ code, state }, deps);

        return new Response(null, {
          status: 302,
          headers: { Location: "/app/settings?connected=true" },
        });
      } catch (error) {
        if (error instanceof BsaleConnectionError) {
          logger.warn("Bsale connection failed", { error: error.message });
          const encodedError = encodeURIComponent(error.message);
          return new Response(null, {
            status: 302,
            headers: { Location: `/app/settings?error=${encodedError}` },
          });
        }

        logger.error(
          "Bsale callback error",
          error instanceof Error ? error : new Error(String(error))
        );
        return new Response(null, {
          status: 302,
          headers: { Location: "/app/settings?error=connection_failed" },
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
