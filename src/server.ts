import type { Server } from "bun";
import { loadConfig, type Config } from "@/config";

export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export function createHealthResponse(): HealthResponse {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}

export function createServer(config: Config): Server<undefined> {
  return Bun.serve({
    port: config.port,
    fetch(request: Request): Response {
      const url = new URL(request.url);

      if (url.pathname === "/health" && request.method === "GET") {
        return Response.json(createHealthResponse());
      }

      return Response.json({ error: "Not Found" }, { status: 404 });
    },
  });
}

export function startServer(config?: Config): Server<undefined> {
  const resolvedConfig = config ?? loadConfig();
  const server = createServer(resolvedConfig);
  console.info(`Server started on port ${String(resolvedConfig.port)}`);
  return server;
}

// Only run when executed directly (not imported)
if (import.meta.main) {
  startServer();
}
