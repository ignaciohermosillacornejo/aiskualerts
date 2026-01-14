import { loadConfig } from "@/config";
import { createServer, type ServerDependencies } from "@/server";
import { Scheduler } from "@/scheduler";
import { getDb } from "@/db/client";
import { createSyncJob } from "@/jobs/sync-job";
import { createSessionCleanupScheduler } from "@/jobs/session-cleanup-job";
import { createDigestJob } from "@/jobs/digest-job";
import { createEmailClient } from "@/email/resend-client";
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
import { MercadoPagoClient } from "@/billing/mercadopago";
import { createAuthMiddleware } from "@/api/middleware/auth";
import { logger } from "@/utils/logger";

export function main(): void {
  const config = loadConfig();

  // Initialize Sentry error monitoring
  const sentryConfig = createSentryConfig(config);
  const sentryEnabled = initializeSentry(sentryConfig);
  if (sentryEnabled) {
    setupProcessErrorHandlers();
  }

  logger.info("Starting AI SKU Alerts", { nodeEnv: config.nodeEnv });

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

  // Initialize repositories (shared across features)
  const sessionRepo = new SessionRepository(db);
  const tenantRepo = new TenantRepository(db);
  const userRepo = new UserRepository(db);

  // Initialize session cleanup scheduler (runs every hour)
  const sessionCleanupScheduler = createSessionCleanupScheduler(sessionRepo, {
    intervalMs: 60 * 60 * 1000, // 1 hour
    runOnStart: true,
  });

  // Initialize digest email scheduler
  const emailClient = createEmailClient(config);
  const digestJob = createDigestJob({ db, config, emailClient });
  const digestScheduler = new Scheduler(digestJob, {
    enabled: config.digestEnabled,
    hour: config.digestHour,
    minute: config.digestMinute,
  });

  // Create auth middleware for protected routes
  const authMiddleware = createAuthMiddleware(sessionRepo, userRepo);

  // Initialize server dependencies
  const serverDeps: ServerDependencies = {};

  // OAuth dependencies (if configured)
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
    const stateStore = new OAuthStateStore(10); // 10 minute TTL

    serverDeps.oauthDeps = {
      oauthClient,
      tenantRepo,
      userRepo,
      sessionRepo,
      stateStore,
    };

    logger.info("OAuth endpoints enabled");
  } else {
    logger.info("OAuth endpoints disabled (missing configuration)");
  }

  // Billing dependencies (if MercadoPago is configured)
  if (config.mercadoPagoAccessToken) {
    const mercadoPagoClient = new MercadoPagoClient({
      accessToken: config.mercadoPagoAccessToken,
      webhookSecret: config.mercadoPagoWebhookSecret,
      planAmount: config.mercadoPagoPlanAmount,
      planCurrency: config.mercadoPagoPlanCurrency,
      appUrl: config.appUrl ?? `http://localhost:${String(config.port)}`,
    });

    serverDeps.billingDeps = {
      mercadoPagoClient,
      authMiddleware,
      tenantRepo,
      userRepo,
    };

    logger.info("Billing endpoints enabled");
  } else {
    logger.info("Billing endpoints disabled (missing MercadoPago configuration)");
  }

  // Sync dependencies (always enabled when auth is available)
  serverDeps.syncDeps = {
    authMiddleware,
    db,
    config,
    tenantRepo,
  };
  logger.info("Sync endpoints enabled");

  // Start the HTTP server
  const server = createServer(config, serverDeps);
  logger.info("HTTP server listening", { port: server.port });

  // Start the schedulers
  scheduler.start();
  sessionCleanupScheduler.start();
  digestScheduler.start();

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down...");

    scheduler.stop();
    sessionCleanupScheduler.stop();
    digestScheduler.stop();
    await server.stop(true);
    await db.close();

    // Flush any pending Sentry events
    await flushSentry();

    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

// Only run when executed directly (not imported)
if (import.meta.main) {
  main();
}
