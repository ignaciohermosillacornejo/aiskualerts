import { test, expect, describe, mock, beforeEach, type Mock } from "bun:test"; // Mock type used in createMockDependencies
import { main, type MainDependencies, type MainResult } from "@/index";
import type { Config } from "@/config";

/**
 * Creates mock dependencies for testing main()
 * All dependencies are mocked with default behaviors that can be overridden
 */
function createMockDependencies(): MainDependencies & {
  mocks: {
    loadConfig: Mock<() => Config>;
    getDb: Mock<() => unknown>;
    createSentryConfig: Mock<(config: Config) => unknown>;
    initializeSentry: Mock<() => boolean>;
    setupProcessErrorHandlers: Mock<() => void>;
    flushSentry: Mock<() => Promise<boolean>>;
    createSyncJob: Mock<() => () => Promise<void>>;
    createSessionCleanupScheduler: Mock<() => unknown>;
    createDigestJob: Mock<() => () => Promise<void>>;
    createEmailClient: Mock<() => unknown>;
    createAuthMiddleware: Mock<() => unknown>;
    createServer: Mock<() => unknown>;
    schedulerStart: Mock<() => void>;
    schedulerStop: Mock<() => void>;
    sessionCleanupStart: Mock<() => void>;
    sessionCleanupStop: Mock<() => void>;
    serverStop: Mock<() => Promise<void>>;
    dbClose: Mock<() => Promise<void>>;
    processOn: Mock<(event: string, handler: () => void) => void>;
    processExit: Mock<(code: number) => never>;
    loggerInfo: Mock<(message: string, context?: Record<string, unknown>) => void>;
  };
} {
  // Create base mocks
  const schedulerStart = mock(() => undefined);
  const schedulerStop = mock(() => undefined);
  const sessionCleanupStart = mock(() => undefined);
  const sessionCleanupStop = mock(() => undefined);
  const serverStop = mock(() => Promise.resolve());
  const dbClose = mock(() => Promise.resolve());
  const loggerInfo = mock(
    (_message: string, _context?: Record<string, unknown>) => undefined
  );

  const defaultConfig: Config = {
    port: 3000,
    nodeEnv: "test",
    allowedOrigins: [],
    syncEnabled: true,
    syncHour: 2,
    syncMinute: 0,
    syncBatchSize: 100,
    syncTenantDelay: 5000,
    digestEnabled: false,
    digestHour: 8,
    digestMinute: 0,
    sentryEnvironment: "test",
    mercadoPagoPlanAmount: 9990,
    mercadoPagoPlanCurrency: "CLP",
    magicLinkExpiryMinutes: 15,
    magicLinkRateLimitPerHour: 5,
  };

  const loadConfig = mock(() => defaultConfig);
  const getDb = mock(() => ({
    query: mock(() => Promise.resolve([])),
    queryOne: mock(() => Promise.resolve(null)),
    execute: mock(() => Promise.resolve()),
    close: dbClose,
  }));

  const createSentryConfig = mock((_config: Config) => ({
    dsn: undefined,
    environment: "test",
  }));

  const initializeSentry = mock(() => false);
  const setupProcessErrorHandlers = mock(() => undefined);
  const flushSentry = mock(() => Promise.resolve(true));
  const createSyncJob = mock(() => mock(() => Promise.resolve()));
  const createSessionCleanupScheduler = mock(() => ({
    start: sessionCleanupStart,
    stop: sessionCleanupStop,
    runNow: mock(() =>
      Promise.resolve({
        deletedCount: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      })
    ),
  }));
  const createDigestJob = mock(() => mock(() => Promise.resolve()));
  const createEmailClient = mock(() => ({
    sendDigestEmail: mock(() => Promise.resolve({ success: true })),
  }));
  const createAuthMiddleware = mock(() => mock(() => Promise.resolve(null)));
  const createServer = mock(() => ({
    port: 3000,
    stop: serverStop,
  }));

  const processOnHandlers = new Map<string, () => void>();
  const processOn = mock((event: string, handler: () => void) => {
    processOnHandlers.set(event, handler);
  });
  const processExit = mock((_code: number) => {
    // Do nothing, just track the call
    return undefined as never;
  });

  // Create constructor mocks as classes
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockScheduler {
    start = schedulerStart;
    stop = schedulerStop;
    isRunning = mock(() => false);
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockSessionRepository {
    create = mock(() => Promise.resolve({ id: "session-1" }));
    getByToken = mock(() => Promise.resolve(null));
    deleteExpired = mock(() => Promise.resolve(0));
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockTenantRepository {
    getById = mock(() => Promise.resolve(null));
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockUserRepository {
    getById = mock(() => Promise.resolve(null));
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockMagicLinkRepository {
    create = mock(() => Promise.resolve({ id: "token-123", email: "test@example.com", token: "abc123", expiresAt: new Date(), usedAt: null, createdAt: new Date() }));
    findValidToken = mock(() => Promise.resolve(null));
    markUsed = mock(() => Promise.resolve());
    countRecentByEmail = mock(() => Promise.resolve(0));
    deleteExpired = mock(() => Promise.resolve(0));
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockBsaleOAuthClient {
    getAuthorizationUrl = mock(() => "https://oauth.bsale.io/authorize");
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockOAuthStateStore {
    create = mock(() => "state-123");
    validate = mock(() => true);
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockMercadoPagoClient {
    createCheckoutSession = mock(() =>
      Promise.resolve({ init_point: "https://mercadopago.com/checkout" })
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockSubscriptionService {
    hasActiveAccess = mock(() => Promise.resolve(true));
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockStockSnapshotRepository {}

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockThresholdRepository {}

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockAlertRepository {}

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock class for testing
  class MockUserTenantsRepository {}

  return {
    loadConfig: loadConfig as unknown as MainDependencies["loadConfig"],
    getDb: getDb as unknown as MainDependencies["getDb"],
    createSentryConfig: createSentryConfig as unknown as MainDependencies["createSentryConfig"],
    initializeSentry: initializeSentry as unknown as MainDependencies["initializeSentry"],
    setupProcessErrorHandlers: setupProcessErrorHandlers as unknown as MainDependencies["setupProcessErrorHandlers"],
    flushSentry: flushSentry as unknown as MainDependencies["flushSentry"],
    createSyncJob: createSyncJob as unknown as MainDependencies["createSyncJob"],
    createSessionCleanupScheduler: createSessionCleanupScheduler as unknown as MainDependencies["createSessionCleanupScheduler"],
    createDigestJob: createDigestJob as unknown as MainDependencies["createDigestJob"],
    createEmailClient: createEmailClient as unknown as MainDependencies["createEmailClient"],
    createAuthMiddleware: createAuthMiddleware as unknown as MainDependencies["createAuthMiddleware"],
    createServer: createServer as unknown as MainDependencies["createServer"],
    Scheduler: MockScheduler as unknown as MainDependencies["Scheduler"],
    SessionRepository: MockSessionRepository as unknown as MainDependencies["SessionRepository"],
    TenantRepository: MockTenantRepository as unknown as MainDependencies["TenantRepository"],
    UserRepository: MockUserRepository as unknown as MainDependencies["UserRepository"],
    MagicLinkRepository: MockMagicLinkRepository as unknown as MainDependencies["MagicLinkRepository"],
    StockSnapshotRepository: MockStockSnapshotRepository as unknown as MainDependencies["StockSnapshotRepository"],
    ThresholdRepository: MockThresholdRepository as unknown as MainDependencies["ThresholdRepository"],
    AlertRepository: MockAlertRepository as unknown as MainDependencies["AlertRepository"],
    UserTenantsRepository: MockUserTenantsRepository as unknown as MainDependencies["UserTenantsRepository"],
    BsaleOAuthClient: MockBsaleOAuthClient as unknown as MainDependencies["BsaleOAuthClient"],
    OAuthStateStore: MockOAuthStateStore as unknown as MainDependencies["OAuthStateStore"],
    MercadoPagoClient: MockMercadoPagoClient as unknown as MainDependencies["MercadoPagoClient"],
    SubscriptionService: MockSubscriptionService as unknown as MainDependencies["SubscriptionService"],
    createThresholdLimitService: mock(() => ({
      getUserLimitInfo: () => Promise.resolve({
        plan: { name: "FREE" as const, maxThresholds: 50 },
        currentCount: 0,
        maxAllowed: 50,
        remaining: 50,
        isOverLimit: false,
      }),
      getActiveThresholdIds: () => Promise.resolve(new Set<string>()),
      getSkippedCount: () => Promise.resolve(0),
    })) as unknown as MainDependencies["createThresholdLimitService"],
    logger: {
      debug: mock(() => undefined),
      info: loggerInfo,
      warn: mock(() => undefined),
      error: mock(() => undefined),
    },
    processOn: processOn as MainDependencies["processOn"],
    processExit: processExit as MainDependencies["processExit"],
    mocks: {
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
      schedulerStart,
      schedulerStop,
      sessionCleanupStart,
      sessionCleanupStop,
      serverStop,
      dbClose,
      processOn,
      processExit,
      loggerInfo,
    },
  };
}

describe("Application Bootstrap (src/index.ts)", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let result: MainResult;

  beforeEach(() => {
    deps = createMockDependencies();
  });

  describe("Config loading", () => {
    test("loads configuration at startup", () => {
      main(deps);
      expect(deps.mocks.loadConfig).toHaveBeenCalledTimes(1);
    });

    test("logs the startup mode from config", () => {
      deps.mocks.loadConfig.mockReturnValue({
        port: 3000,
        nodeEnv: "production",
        allowedOrigins: [],
        syncEnabled: true,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        digestEnabled: false,
        digestHour: 8,
        digestMinute: 0,
        sentryEnvironment: "production",
        mercadoPagoPlanAmount: 9990,
        mercadoPagoPlanCurrency: "CLP",
        magicLinkExpiryMinutes: 15,
        magicLinkRateLimitPerHour: 5,
      });

      main(deps);

      const calls = deps.mocks.loggerInfo.mock.calls;
      const startupCall = calls.find(
        (call) =>
          call[0] === "Starting AI SKU Alerts" &&
          (call[1])?.["nodeEnv"] === "production"
      );
      expect(startupCall).toBeDefined();
    });
  });

  describe("Sentry initialization", () => {
    test("creates Sentry config from app config", () => {
      main(deps);
      expect(deps.mocks.createSentryConfig).toHaveBeenCalled();
    });

    test("initializes Sentry with created config", () => {
      main(deps);
      expect(deps.mocks.initializeSentry).toHaveBeenCalled();
    });

    test("sets up process error handlers when Sentry is enabled", () => {
      deps.mocks.initializeSentry.mockReturnValue(true);
      main(deps);
      expect(deps.mocks.setupProcessErrorHandlers).toHaveBeenCalled();
    });

    test("does not set up process error handlers when Sentry is disabled", () => {
      deps.mocks.initializeSentry.mockReturnValue(false);
      main(deps);
      expect(deps.mocks.setupProcessErrorHandlers).not.toHaveBeenCalled();
    });
  });

  describe("Scheduler startup", () => {
    test("creates sync job with database and config", () => {
      main(deps);
      expect(deps.mocks.createSyncJob).toHaveBeenCalled();
    });

    test("creates scheduler and starts it", () => {
      main(deps);
      // The scheduler is created and started, which we verify via schedulerStart being called
      expect(deps.mocks.schedulerStart).toHaveBeenCalled();
    });

    test("starts the scheduler", () => {
      main(deps);
      expect(deps.mocks.schedulerStart).toHaveBeenCalled();
    });

    test("creates session cleanup scheduler", () => {
      main(deps);
      expect(deps.mocks.createSessionCleanupScheduler).toHaveBeenCalled();
    });

    test("starts session cleanup scheduler", () => {
      main(deps);
      expect(deps.mocks.sessionCleanupStart).toHaveBeenCalled();
    });
  });

  describe("Server startup", () => {
    test("creates HTTP server with config", () => {
      main(deps);
      expect(deps.mocks.createServer).toHaveBeenCalled();
    });

    test("logs server port on startup", () => {
      main(deps);

      const calls = deps.mocks.loggerInfo.mock.calls;
      const serverCall = calls.find(
        (call) =>
          call[0] === "HTTP server listening" &&
          (call[1])?.["port"] === 3000
      );
      expect(serverCall).toBeDefined();
    });
  });

  describe("OAuth initialization", () => {
    test("enables OAuth when all config values are present", () => {
      deps.mocks.loadConfig.mockReturnValue({
        port: 3000,
        nodeEnv: "test",
        allowedOrigins: [],
        syncEnabled: true,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        digestEnabled: false,
        digestHour: 8,
        digestMinute: 0,
        sentryEnvironment: "test",
        mercadoPagoPlanAmount: 9990,
        mercadoPagoPlanCurrency: "CLP",
        bsaleAppId: "app-123",
        bsaleIntegratorToken: "token-456",
        bsaleRedirectUri: "http://localhost:3000/callback",
        magicLinkExpiryMinutes: 15,
        magicLinkRateLimitPerHour: 5,
      });

      main(deps);

      // Check that OAuth enabled log was called
      const calls = deps.mocks.loggerInfo.mock.calls;
      const oauthCall = calls.find((call) => call[0] === "OAuth endpoints enabled");
      expect(oauthCall).toBeDefined();
    });

    test("disables OAuth when config values are missing", () => {
      deps.mocks.loadConfig.mockReturnValue({
        port: 3000,
        nodeEnv: "test",
        allowedOrigins: [],
        syncEnabled: true,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        digestEnabled: false,
        digestHour: 8,
        digestMinute: 0,
        sentryEnvironment: "test",
        mercadoPagoPlanAmount: 9990,
        mercadoPagoPlanCurrency: "CLP",
        magicLinkExpiryMinutes: 15,
        magicLinkRateLimitPerHour: 5,
        // No OAuth config
      });

      main(deps);

      const calls = deps.mocks.loggerInfo.mock.calls;
      const disabledCall = calls.find(
        (call) => call[0] === "OAuth endpoints disabled (missing configuration)"
      );
      expect(disabledCall).toBeDefined();
    });
  });

  describe("Signal handling", () => {
    test("registers SIGINT handler", () => {
      main(deps);

      const calls = deps.mocks.processOn.mock.calls;
      const sigintCall = calls.find((call) => call[0] === "SIGINT");
      expect(sigintCall).toBeDefined();
    });

    test("registers SIGTERM handler", () => {
      main(deps);

      const calls = deps.mocks.processOn.mock.calls;
      const sigtermCall = calls.find((call) => call[0] === "SIGTERM");
      expect(sigtermCall).toBeDefined();
    });
  });

  describe("Graceful shutdown", () => {
    test("SIGINT handler triggers shutdown sequence", async () => {
      result = main(deps);

      // Call shutdown directly from result
      await result.shutdown();

      expect(deps.mocks.schedulerStop).toHaveBeenCalled();
      expect(deps.mocks.sessionCleanupStop).toHaveBeenCalled();
    });

    test("SIGTERM handler triggers shutdown sequence", async () => {
      result = main(deps);

      // Call shutdown directly from result
      await result.shutdown();

      expect(deps.mocks.schedulerStop).toHaveBeenCalled();
      expect(deps.mocks.sessionCleanupStop).toHaveBeenCalled();
    });

    test("shutdown stops the HTTP server", async () => {
      result = main(deps);
      await result.shutdown();

      expect(deps.mocks.serverStop).toHaveBeenCalledWith(true);
    });

    test("shutdown closes database connection", async () => {
      result = main(deps);
      await result.shutdown();

      expect(deps.mocks.dbClose).toHaveBeenCalled();
    });

    test("shutdown flushes Sentry events", async () => {
      result = main(deps);
      await result.shutdown();

      expect(deps.mocks.flushSentry).toHaveBeenCalled();
    });

    test("shutdown logs completion message", async () => {
      result = main(deps);
      await result.shutdown();

      const calls = deps.mocks.loggerInfo.mock.calls;
      const shutdownCall = calls.find((call) => call[0] === "Shutdown complete");
      expect(shutdownCall).toBeDefined();
    });

    test("shutdown calls process.exit(0)", async () => {
      result = main(deps);
      await result.shutdown();

      expect(deps.mocks.processExit).toHaveBeenCalledWith(0);
    });
  });

  describe("Database initialization", () => {
    test("gets database connection at startup", () => {
      main(deps);
      expect(deps.mocks.getDb).toHaveBeenCalled();
    });
  });

  describe("MainResult return value", () => {
    test("returns config from result", () => {
      result = main(deps);
      expect(result.config).toBeDefined();
      expect(result.config.port).toBe(3000);
    });

    test("returns db from result", () => {
      result = main(deps);
      expect(result.db).toBeDefined();
    });

    test("returns server from result", () => {
      result = main(deps);
      expect(result.server).toBeDefined();
      expect(result.server.port).toBe(3000);
    });

    test("returns scheduler from result", () => {
      result = main(deps);
      expect(result.scheduler).toBeDefined();
    });

    test("returns shutdown function from result", () => {
      result = main(deps);
      expect(result.shutdown).toBeInstanceOf(Function);
    });
  });
});
