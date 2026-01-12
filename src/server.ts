import type { Server } from "bun";
import { loadConfig, type Config } from "@/config";
import type { OAuthHandlerDeps } from "@/api/handlers/oauth";
import { createOAuthRoutes } from "@/api/routes/oauth";

export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface ServerDependencies {
  oauthDeps?: OAuthHandlerDeps;
}

export function createHealthResponse(): HealthResponse {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}

export function createServer(
  config: Config,
  deps?: ServerDependencies
): Server<undefined> {
  const oauthRoutes = deps?.oauthDeps ? createOAuthRoutes(deps.oauthDeps) : null;

  return Bun.serve({
    port: config.port,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      // Health check endpoint
      if (url.pathname === "/health" && request.method === "GET") {
        return Response.json(createHealthResponse());
      }

      // OAuth routes
      if (oauthRoutes) {
        if (url.pathname === "/api/auth/bsale/start" && request.method === "GET") {
          return oauthRoutes.start(request);
        }

        if (url.pathname === "/api/auth/bsale/callback" && request.method === "GET") {
          return await oauthRoutes.callback(request);
        }

        if (url.pathname === "/api/auth/logout" && request.method === "POST") {
          return await oauthRoutes.logout(request);
        }
      }

      return Response.json({ error: "Not Found" }, { status: 404 });
    },
  });
}

export function startServer(
  config?: Config,
  deps?: ServerDependencies
): Server<undefined> {
  const resolvedConfig = config ?? loadConfig();
  const server = createServer(resolvedConfig, deps);
  console.info(`Server started on port ${String(resolvedConfig.port)}`);
  return server;
}

// Only run when executed directly (not imported)
if (import.meta.main) {
  startServer();
}
