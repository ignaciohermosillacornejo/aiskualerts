import {
  test,
  expect,
  describe,
  mock,
  beforeEach,
  afterEach,
  spyOn,
  type Mock,
} from "bun:test";
import type { Config } from "@/config";

// Create mock functions that we can inspect
const mockLoadConfig = mock((): Partial<Config> => ({
  port: 3000,
  nodeEnv: "test",
  syncEnabled: true,
  syncHour: 2,
  syncMinute: 0,
  syncBatchSize: 100,
  syncTenantDelay: 5000,
}));

const mockCreateSentryConfig = mock((config: Config) => ({
  dsn: config.sentryDsn,
  environment: config.sentryEnvironment,
}));

const mockInitializeSentry = mock(() => true);
const mockSetupProcessErrorHandlers = mock(() => undefined);
const mockFlushSentry = mock(() => Promise.resolve(true));
const mockResetSentry = mock(() => undefined);

// Mock database client
const mockDbClose = mock(() => Promise.resolve());
const mockGetDb = mock(() => ({
  query: mock(() => Promise.resolve([])),
  queryOne: mock(() => Promise.resolve(null)),
  execute: mock(() => Promise.resolve()),
  close: mockDbClose,
}));

// Mock scheduler
const mockSchedulerStart = mock(() => undefined);
const mockSchedulerStop = mock(() => undefined);
const mockScheduler = mock(function MockScheduler() {
  return {
    start: mockSchedulerStart,
    stop: mockSchedulerStop,
    isRunning: mock(() => false),
  };
}) as unknown as new (
  job: () => Promise<void>,
  config: { enabled: boolean; hour: number; minute: number }
) => { start: () => void; stop: () => void; isRunning: () => boolean };

// Mock session cleanup scheduler
const mockSessionCleanupStart = mock(() => undefined);
const mockSessionCleanupStop = mock(() => undefined);
const mockCreateSessionCleanupScheduler = mock(() => ({
  start: mockSessionCleanupStart,
  stop: mockSessionCleanupStop,
  runNow: mock(() => Promise.resolve({ deletedCount: 0, startedAt: new Date(), completedAt: new Date() })),
}));

// Mock sync job
const mockSyncJob = mock(() => Promise.resolve());
const mockCreateSyncJob = mock(() => mockSyncJob);

// Mock server
const mockServerStop = mock(() => Promise.resolve());
const mockServer = {
  port: 3000,
  stop: mockServerStop,
};
const mockCreateServer = mock(() => mockServer);

// Mock repositories
const mockSessionRepository = mock(function MockSessionRepository() {
  return {
    create: mock(() => Promise.resolve({ id: "session-1" })),
    getByToken: mock(() => Promise.resolve(null)),
    deleteExpired: mock(() => Promise.resolve(0)),
  };
}) as unknown as new (db: unknown) => unknown;

const mockTenantRepository = mock(function MockTenantRepository() {
  return {
    getById: mock(() => Promise.resolve(null)),
  };
}) as unknown as new (db: unknown) => unknown;

const mockUserRepository = mock(function MockUserRepository() {
  return {
    getById: mock(() => Promise.resolve(null)),
  };
}) as unknown as new (db: unknown) => unknown;

// Mock OAuth client
const mockBsaleOAuthClient = mock(function MockBsaleOAuthClient() {
  return {
    getAuthorizationUrl: mock(() => "https://oauth.bsale.io/authorize"),
  };
}) as unknown as new (config: unknown) => unknown;

// Mock OAuth state store
const mockOAuthStateStore = mock(function MockOAuthStateStore() {
  return {
    create: mock(() => "state-123"),
    validate: mock(() => true),
  };
}) as unknown as new (ttlMinutes: number) => unknown;

// Track process.on calls
const processOnCalls: { event: string; handler: (...args: unknown[]) => void }[] = [];
let originalProcessOn: typeof process.on;
let originalProcessExit: typeof process.exit;
let mockProcessExit: ReturnType<typeof mock>;

// Mock modules - using void to ignore Promise return values
void mock.module("@/config", () => ({
  loadConfig: mockLoadConfig,
}));

void mock.module("@/monitoring/sentry", () => ({
  createSentryConfig: mockCreateSentryConfig,
  initializeSentry: mockInitializeSentry,
  setupProcessErrorHandlers: mockSetupProcessErrorHandlers,
  flushSentry: mockFlushSentry,
  resetSentry: mockResetSentry,
}));

void mock.module("@/db/client", () => ({
  getDb: mockGetDb,
}));

void mock.module("@/scheduler", () => ({
  Scheduler: mockScheduler,
}));

void mock.module("@/jobs/session-cleanup-job", () => ({
  createSessionCleanupScheduler: mockCreateSessionCleanupScheduler,
}));

void mock.module("@/jobs/sync-job", () => ({
  createSyncJob: mockCreateSyncJob,
}));

void mock.module("@/server", () => ({
  createServer: mockCreateServer,
}));

void mock.module("@/db/repositories/session", () => ({
  SessionRepository: mockSessionRepository,
}));

void mock.module("@/db/repositories/tenant", () => ({
  TenantRepository: mockTenantRepository,
}));

void mock.module("@/db/repositories/user", () => ({
  UserRepository: mockUserRepository,
}));

void mock.module("@/bsale/oauth-client", () => ({
  BsaleOAuthClient: mockBsaleOAuthClient,
}));

void mock.module("@/utils/oauth-state-store", () => ({
  OAuthStateStore: mockOAuthStateStore,
}));

describe("Application Bootstrap (src/index.ts)", () => {
  let consoleInfoSpy: Mock<typeof console.info>;

  beforeEach(() => {
    // Reset all mocks
    mockLoadConfig.mockClear();
    mockCreateSentryConfig.mockClear();
    mockInitializeSentry.mockClear();
    mockSetupProcessErrorHandlers.mockClear();
    mockFlushSentry.mockClear();
    mockGetDb.mockClear();
    mockSchedulerStart.mockClear();
    mockSchedulerStop.mockClear();
    mockSessionCleanupStart.mockClear();
    mockSessionCleanupStop.mockClear();
    mockCreateSyncJob.mockClear();
    mockCreateServer.mockClear();
    mockServerStop.mockClear();
    mockDbClose.mockClear();
    mockCreateSessionCleanupScheduler.mockClear();

    // Clear process.on tracking
    processOnCalls.length = 0;

    // Mock process.on to track signal handlers - store reference for restoration
    originalProcessOn = process.on.bind(process);
    process.on = ((event: string, handler: (...args: unknown[]) => void) => {
      processOnCalls.push({ event, handler });
      return process;
    }) as typeof process.on;

    // Mock process.exit to prevent actual exit - store reference for restoration
    originalProcessExit = process.exit.bind(process);
    mockProcessExit = mock(() => undefined);
    // @ts-expect-error - Mocking process.exit
    process.exit = mockProcessExit;

    // Spy on console.info
    consoleInfoSpy = spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Restore original functions
    process.on = originalProcessOn;
    process.exit = originalProcessExit;
    // Restore console.info spy
    consoleInfoSpy.mockRestore();
  });

  describe("Config loading", () => {
    test("loads configuration at startup", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    });

    test("logs the startup mode from config", async () => {
      mockLoadConfig.mockReturnValue({
        port: 3000,
        nodeEnv: "production",
        syncEnabled: true,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
      } as Partial<Config>);

      const { main } = await import("@/index");
      main();

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("production")
      );
    });
  });

  describe("Sentry initialization", () => {
    test("creates Sentry config from app config", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockCreateSentryConfig).toHaveBeenCalled();
    });

    test("initializes Sentry with created config", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockInitializeSentry).toHaveBeenCalled();
    });

    test("sets up process error handlers when Sentry is enabled", async () => {
      mockInitializeSentry.mockReturnValue(true);

      const { main } = await import("@/index");
      main();

      expect(mockSetupProcessErrorHandlers).toHaveBeenCalled();
    });

    test("does not set up process error handlers when Sentry is disabled", async () => {
      mockInitializeSentry.mockReturnValue(false);
      mockSetupProcessErrorHandlers.mockClear();

      const { main } = await import("@/index");
      main();

      expect(mockSetupProcessErrorHandlers).not.toHaveBeenCalled();
    });
  });

  describe("Scheduler startup", () => {
    test("creates sync job with database and config", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockCreateSyncJob).toHaveBeenCalled();
    });

    test("creates scheduler with sync job and config", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockScheduler).toHaveBeenCalled();
    });

    test("starts the scheduler", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockSchedulerStart).toHaveBeenCalled();
    });

    test("creates session cleanup scheduler", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockCreateSessionCleanupScheduler).toHaveBeenCalled();
    });

    test("starts session cleanup scheduler", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockSessionCleanupStart).toHaveBeenCalled();
    });
  });

  describe("Server startup", () => {
    test("creates HTTP server with config", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockCreateServer).toHaveBeenCalled();
    });

    test("logs server port on startup", async () => {
      const { main } = await import("@/index");
      main();

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("3000")
      );
    });
  });

  describe("OAuth initialization", () => {
    test("enables OAuth when all config values are present", async () => {
      mockLoadConfig.mockReturnValue({
        port: 3000,
        nodeEnv: "test",
        syncEnabled: true,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        bsaleAppId: "app-123",
        bsaleIntegratorToken: "token-456",
        bsaleRedirectUri: "http://localhost:3000/callback",
      } as Partial<Config>);

      const { main } = await import("@/index");
      main();

      expect(mockBsaleOAuthClient).toHaveBeenCalled();
      expect(mockOAuthStateStore).toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalledWith("OAuth endpoints enabled");
    });

    test("disables OAuth when config values are missing", async () => {
      mockLoadConfig.mockReturnValue({
        port: 3000,
        nodeEnv: "test",
        syncEnabled: true,
        syncHour: 2,
        syncMinute: 0,
        syncBatchSize: 100,
        syncTenantDelay: 5000,
        // No OAuth config
      } as Partial<Config>);

      // Reset the mock counter by updating the mock implementation
      (mockBsaleOAuthClient as unknown as ReturnType<typeof mock>).mockClear();

      const { main } = await import("@/index");
      main();

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "OAuth endpoints disabled (missing configuration)"
      );
    });
  });

  describe("Signal handling", () => {
    test("registers SIGINT handler", async () => {
      const { main } = await import("@/index");
      main();

      const sigintHandler = processOnCalls.find((c) => c.event === "SIGINT");
      expect(sigintHandler).toBeDefined();
    });

    test("registers SIGTERM handler", async () => {
      const { main } = await import("@/index");
      main();

      const sigtermHandler = processOnCalls.find((c) => c.event === "SIGTERM");
      expect(sigtermHandler).toBeDefined();
    });
  });

  describe("Graceful shutdown", () => {
    test("SIGINT handler triggers shutdown sequence", async () => {
      const { main } = await import("@/index");
      main();

      const sigintHandler = processOnCalls.find((c) => c.event === "SIGINT");
      expect(sigintHandler).toBeDefined();

      // Trigger shutdown - the handler returns void (wraps async shutdown)
      sigintHandler?.handler();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSchedulerStop).toHaveBeenCalled();
      expect(mockSessionCleanupStop).toHaveBeenCalled();
    });

    test("SIGTERM handler triggers shutdown sequence", async () => {
      const { main } = await import("@/index");
      main();

      const sigtermHandler = processOnCalls.find((c) => c.event === "SIGTERM");
      expect(sigtermHandler).toBeDefined();

      // Trigger shutdown - the handler returns void (wraps async shutdown)
      sigtermHandler?.handler();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSchedulerStop).toHaveBeenCalled();
      expect(mockSessionCleanupStop).toHaveBeenCalled();
    });

    test("shutdown stops the HTTP server", async () => {
      const { main } = await import("@/index");
      main();

      const sigintHandler = processOnCalls.find((c) => c.event === "SIGINT");

      // Trigger shutdown
      sigintHandler?.handler();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockServerStop).toHaveBeenCalledWith(true);
    });

    test("shutdown closes database connection", async () => {
      const { main } = await import("@/index");
      main();

      const sigintHandler = processOnCalls.find((c) => c.event === "SIGINT");

      // Trigger shutdown
      sigintHandler?.handler();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockDbClose).toHaveBeenCalled();
    });

    test("shutdown flushes Sentry events", async () => {
      const { main } = await import("@/index");
      main();

      const sigintHandler = processOnCalls.find((c) => c.event === "SIGINT");

      // Trigger shutdown
      sigintHandler?.handler();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFlushSentry).toHaveBeenCalled();
    });

    test("shutdown logs completion message", async () => {
      const { main } = await import("@/index");
      main();

      const sigintHandler = processOnCalls.find((c) => c.event === "SIGINT");

      // Trigger shutdown
      sigintHandler?.handler();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleInfoSpy).toHaveBeenCalledWith("Shutdown complete");
    });

    test("shutdown calls process.exit(0)", async () => {
      const { main } = await import("@/index");
      main();

      const sigintHandler = processOnCalls.find((c) => c.event === "SIGINT");

      // Trigger shutdown
      sigintHandler?.handler();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe("Database initialization", () => {
    test("gets database connection at startup", async () => {
      const { main } = await import("@/index");
      main();

      expect(mockGetDb).toHaveBeenCalled();
    });
  });
});
