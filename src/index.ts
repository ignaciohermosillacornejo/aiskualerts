import { loadConfig } from "@/config";
import { createServer, type ServerDependencies } from "@/server";
import { Scheduler } from "@/scheduler";
import { getDb } from "@/db/client";
import { createSyncJob } from "@/jobs/sync-job";
import { createSessionCleanupScheduler } from "@/jobs/session-cleanup-job";
import { BsaleOAuthClient } from "@/bsale/oauth-client";
import { TenantRepository } from "@/db/repositories/tenant";
import { UserRepository } from "@/db/repositories/user";
import { SessionRepository } from "@/db/repositories/session";
import { OAuthStateStore } from "@/utils/oauth-state-store";
import {
  initializeSentry,
  createSentryConfig,
  setupProcessErrorHandlers,
  flushSentry,
} from "@/monitoring/sentry";

export function main(): void {
  const config = loadConfig();

  // Initialize Sentry error monitoring
  const sentryConfig = createSentryConfig(config);
  const sentryEnabled = initializeSentry(sentryConfig);
  if (sentryEnabled) {
    setupProcessErrorHandlers();
  }

  console.info(`Starting AI SKU Alerts in ${config.nodeEnv} mode...`);

  // Initialize database
  const db = getDb();

  // Create the sync job
  const syncJob = createSyncJob(db, config);

  // Initialize scheduler
  const scheduler = new Scheduler(syncJob, {
    enabled: config.syncEnabled,
    hour: config.syncHour,
    minute: config.syncMinute,
  });

  // Initialize session cleanup scheduler (runs every hour)
  const sessionRepo = new SessionRepository(db);
  const sessionCleanupScheduler = createSessionCleanupScheduler(sessionRepo, {
    intervalMs: 60 * 60 * 1000, // 1 hour
    runOnStart: true,
  });

  // Initialize OAuth dependencies (if configured)
  const serverDeps: ServerDependencies = {};
  if (
    config.bsaleAppId &&
    config.bsaleIntegratorToken &&
    config.bsaleRedirectUri
  ) {
    const oauthConfig = {
      appId: config.bsaleAppId,
      integratorToken: config.bsaleIntegratorToken,
      redirectUri: config.bsaleRedirectUri,
      ...(config.bsaleOAuthBaseUrl && { oauthBaseUrl: config.bsaleOAuthBaseUrl }),
    };
    const oauthClient = new BsaleOAuthClient(oauthConfig);

    const tenantRepo = new TenantRepository(db);
    const userRepo = new UserRepository(db);
    const stateStore = new OAuthStateStore(10); // 10 minute TTL

    serverDeps.oauthDeps = {
      oauthClient,
      tenantRepo,
      userRepo,
      sessionRepo,
      stateStore,
    };

    console.info("OAuth endpoints enabled");
  } else {
    console.info("OAuth endpoints disabled (missing configuration)");
  }

  // Start the HTTP server
  const server = createServer(config, serverDeps);
  console.info(`HTTP server listening on port ${String(server.port)}`);

  // Start the schedulers
  scheduler.start();
  sessionCleanupScheduler.start();

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.info("Shutting down...");

    scheduler.stop();
    sessionCleanupScheduler.stop();
    await server.stop(true);
    await db.close();

    // Flush any pending Sentry events
    await flushSentry();

    console.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

// Only run when executed directly (not imported)
if (import.meta.main) {
  main();
}
