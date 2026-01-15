import { loadConfig, type Config } from "@/config";
import { createServer, type ServerDependencies } from "@/server";
import { Scheduler } from "@/scheduler";
import { getDb, type DatabaseClient } from "@/db/client";
import { createSyncJob } from "@/jobs/sync-job";
import { createSessionCleanupScheduler } from "@/jobs/session-cleanup-job";
import { createDigestJob } from "@/jobs/digest-job";
import { createEmailClient } from "@/email/resend-client";
import { BsaleOAuthClient } from "@/bsale/oauth-client";
import { TenantRepository } from "@/db/repositories/tenant";
import { UserRepository } from "@/db/repositories/user";
import { SessionRepository } from "@/db/repositories/session";
import { MagicLinkRepository } from "@/db/repositories/magic-link";
import { OAuthStateStore } from "@/utils/oauth-state-store";
import {
  initializeSentry,
  createSentryConfig,
  setupProcessErrorHandlers,
  flushSentry,
} from "@/monitoring/sentry";
import { MercadoPagoClient } from "@/billing/mercadopago";
import { SubscriptionService } from "@/billing/subscription-service";
import { createAuthMiddleware } from "@/api/middleware/auth";
import { logger as defaultLogger, type Logger } from "@/utils/logger";

/** Dependencies that can be injected into main() for testing */
export interface MainDependencies {
  loadConfig: typeof loadConfig;
  getDb: typeof getDb;
  createSentryConfig: typeof createSentryConfig;
  initializeSentry: typeof initializeSentry;
  setupProcessErrorHandlers: typeof setupProcessErrorHandlers;
  flushSentry: typeof flushSentry;
  createSyncJob: typeof createSyncJob;
  createSessionCleanupScheduler: typeof createSessionCleanupScheduler;
  createDigestJob: typeof createDigestJob;
  createEmailClient: typeof createEmailClient;
  createAuthMiddleware: typeof createAuthMiddleware;
  createServer: typeof createServer;
  Scheduler: typeof Scheduler;
  SessionRepository: typeof SessionRepository;
  TenantRepository: typeof TenantRepository;
  UserRepository: typeof UserRepository;
  MagicLinkRepository: typeof MagicLinkRepository;
  BsaleOAuthClient: typeof BsaleOAuthClient;
  OAuthStateStore: typeof OAuthStateStore;
  MercadoPagoClient: typeof MercadoPagoClient;
  SubscriptionService: typeof SubscriptionService;
  logger: Logger;
  processOn: (event: string, handler: () => void) => void;
  processExit: (code: number) => never;
}

/** Creates the default production dependencies */
export function createMainDependencies(): MainDependencies {
  return {
    loadConfig,
    getDb,
    createSentryConfig,
    initializeSentry,
    setupProcessErrorHandlers,
    flushSentry,
    createSyncJob,
    createSessionCleanupScheduler,
    createDigestJob,
    createEmailClient,
    createAuthMiddleware,
    createServer,
    Scheduler,
    SessionRepository,
    TenantRepository,
    UserRepository,
    MagicLinkRepository,
    BsaleOAuthClient,
    OAuthStateStore,
    MercadoPagoClient,
    SubscriptionService,
    logger: defaultLogger,
    processOn: (event, handler) => {
      process.on(event, handler);
    },
    processExit: (code) => process.exit(code),
  };
}

/** Result returned by main() for testing purposes */
export interface MainResult {
  config: Config;
  db: DatabaseClient;
  server: ReturnType<typeof createServer>;
  scheduler: InstanceType<typeof Scheduler>;
  sessionCleanupScheduler: ReturnType<typeof createSessionCleanupScheduler>;
  digestScheduler: InstanceType<typeof Scheduler>;
  shutdown: () => Promise<void>;
}

export function main(injectedDeps?: Partial<MainDependencies>): MainResult {
  const deps = { ...createMainDependencies(), ...injectedDeps };
  const config = deps.loadConfig();

  // Initialize Sentry error monitoring
  const sentryConfig = deps.createSentryConfig(config);
  const sentryEnabled = deps.initializeSentry(sentryConfig);
  if (sentryEnabled) {
    deps.setupProcessErrorHandlers();
  }

  deps.logger.info("Starting AI SKU Alerts", { nodeEnv: config.nodeEnv });

  // Initialize database
  const db = deps.getDb();

  // Create the sync job
  const syncJob = deps.createSyncJob(db, config);

  // Initialize scheduler
  const scheduler = new deps.Scheduler(syncJob, {
    enabled: config.syncEnabled,
    hour: config.syncHour,
    minute: config.syncMinute,
  });

  // Initialize repositories (shared across features)
  const sessionRepo = new deps.SessionRepository(db);
  const tenantRepo = new deps.TenantRepository(db);
  const userRepo = new deps.UserRepository(db);
  const magicLinkRepo = new deps.MagicLinkRepository(db);

  // Initialize session cleanup scheduler (runs every hour)
  const sessionCleanupScheduler = deps.createSessionCleanupScheduler(
    sessionRepo,
    {
      intervalMs: 60 * 60 * 1000, // 1 hour
      runOnStart: true,
    }
  );

  // Initialize digest email scheduler
  const emailClient = deps.createEmailClient(config);
  const digestJob = deps.createDigestJob({ db, config, emailClient });
  const digestScheduler = new deps.Scheduler(digestJob, {
    enabled: config.digestEnabled,
    hour: config.digestHour,
    minute: config.digestMinute,
  });

  // Create auth middleware for protected routes
  const authMiddleware = deps.createAuthMiddleware(sessionRepo, userRepo);

  // Initialize server dependencies
  const serverDeps: ServerDependencies = {
    tenantRepo,
    userRepo,
    sessionRepo,
  };

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
      ...(config.bsaleOAuthBaseUrl && {
        oauthBaseUrl: config.bsaleOAuthBaseUrl,
      }),
    };
    const oauthClient = new deps.BsaleOAuthClient(oauthConfig);
    const stateStore = new deps.OAuthStateStore(10); // 10 minute TTL

    serverDeps.oauthDeps = {
      oauthClient,
      tenantRepo,
      userRepo,
      sessionRepo,
      stateStore,
    };

    deps.logger.info("OAuth endpoints enabled");
  } else {
    deps.logger.info("OAuth endpoints disabled (missing configuration)");
  }

  // Billing dependencies (if MercadoPago is configured)
  if (config.mercadoPagoAccessToken) {
    const mercadoPagoClient = new deps.MercadoPagoClient({
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

    // Create subscription service for access checks
    serverDeps.subscriptionService = new deps.SubscriptionService({
      mercadoPagoClient,
      tenantRepo,
    });

    deps.logger.info("Billing endpoints enabled");
  } else {
    deps.logger.info(
      "Billing endpoints disabled (missing MercadoPago configuration)"
    );
  }

  // Sync dependencies (always enabled when auth is available)
  serverDeps.syncDeps = {
    authMiddleware,
    db,
    config,
    tenantRepo,
  };
  deps.logger.info("Sync endpoints enabled");

  // Magic link dependencies (always enabled)
  serverDeps.magicLinkDeps = {
    magicLinkRepo,
    tenantRepo,
    userRepo,
    sessionRepo,
    emailClient,
    config: {
      appUrl: config.appUrl ?? `http://localhost:${String(config.port)}`,
      magicLinkExpiryMinutes: config.magicLinkExpiryMinutes,
      magicLinkRateLimitPerHour: config.magicLinkRateLimitPerHour,
    },
  };
  deps.logger.info("Magic link auth enabled");

  // Bsale connection dependencies (if OAuth is configured)
  if (serverDeps.oauthDeps) {
    serverDeps.bsaleConnectionDeps = {
      oauthClient: serverDeps.oauthDeps.oauthClient,
      tenantRepo,
      stateStore: serverDeps.oauthDeps.stateStore,
    };
    deps.logger.info("Bsale connection endpoints enabled");
  }

  // Start the HTTP server
  const server = deps.createServer(config, serverDeps);
  deps.logger.info("HTTP server listening", { port: server.port });

  // Start the schedulers
  scheduler.start();
  sessionCleanupScheduler.start();
  digestScheduler.start();

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    deps.logger.info("Shutting down...");

    scheduler.stop();
    sessionCleanupScheduler.stop();
    digestScheduler.stop();
    await server.stop(true);
    await db.close();

    // Flush any pending Sentry events
    await deps.flushSentry();

    deps.logger.info("Shutdown complete");
    deps.processExit(0);
  };

  deps.processOn("SIGINT", () => void shutdown());
  deps.processOn("SIGTERM", () => void shutdown());

  return {
    config,
    db,
    server,
    scheduler,
    sessionCleanupScheduler,
    digestScheduler,
    shutdown,
  };
}

// Only run when executed directly (not imported)
if (import.meta.main) {
  main();
}
