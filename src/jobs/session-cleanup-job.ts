import type { SessionRepository } from "@/db/repositories/session";

export interface SessionCleanupResult {
  deletedCount: number;
  startedAt: Date;
  completedAt: Date;
}

/**
 * Runs session cleanup and returns the result
 */
export async function runSessionCleanup(
  sessionRepo: SessionRepository
): Promise<SessionCleanupResult> {
  const startedAt = new Date();

  const deletedCount = await sessionRepo.deleteExpired();

  const completedAt = new Date();

  if (deletedCount > 0) {
    console.info(`Cleaned up ${String(deletedCount)} expired sessions`);
  }

  return {
    deletedCount,
    startedAt,
    completedAt,
  };
}

export interface SessionCleanupSchedulerConfig {
  intervalMs: number;
  runOnStart: boolean;
}

const DEFAULT_CLEANUP_CONFIG: SessionCleanupSchedulerConfig = {
  intervalMs: 60 * 60 * 1000, // 1 hour
  runOnStart: true,
};

/**
 * Creates a session cleanup scheduler that runs at regular intervals
 */
export function createSessionCleanupScheduler(
  sessionRepo: SessionRepository,
  config: Partial<SessionCleanupSchedulerConfig> = {}
): {
  start: () => void;
  stop: () => void;
  runNow: () => Promise<SessionCleanupResult>;
} {
  const mergedConfig = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const runCleanup = async (): Promise<SessionCleanupResult> => {
    try {
      return await runSessionCleanup(sessionRepo);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Session cleanup failed: ${message}`);
      throw error;
    }
  };

  const start = (): void => {
    if (intervalId !== null) {
      console.info("Session cleanup scheduler is already running");
      return;
    }

    console.info(
      `Session cleanup scheduler started (interval: ${String(mergedConfig.intervalMs / 1000 / 60)} minutes)`
    );

    if (mergedConfig.runOnStart) {
      void runCleanup();
    }

    intervalId = setInterval(() => {
      void runCleanup();
    }, mergedConfig.intervalMs);
  };

  const stop = (): void => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      console.info("Session cleanup scheduler stopped");
    }
  };

  return {
    start,
    stop,
    runNow: runCleanup,
  };
}
