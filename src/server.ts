import index from "./frontend/index.html";

const PORT = process.env["PORT"] ?? 3000;

const server = Bun.serve({
  port: PORT,
  routes: {
    // Landing page
    "/": index,

    // Health check endpoint
    "/health": {
      GET: () => {
        return Response.json({ status: "ok", timestamp: new Date().toISOString() });
      },
    },

    // API placeholder routes
    "/api/auth/bsale/start": {
      GET: () => {
        // TODO: Implement OAuth flow in Phase 2
        return Response.json({ message: "OAuth not yet implemented" }, { status: 501 });
      },
    },
  },

  // Development settings
  development: {
    hmr: true,
    console: true,
  },
});

console.info(`Server running at http://localhost:${String(server.port)}`);
