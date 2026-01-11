import type { SchedulerConfig, JobFunction } from "./types";
import { DEFAULT_SCHEDULER_CONFIG } from "./types";

export class Scheduler {
  private config: SchedulerConfig;
  private job: JobFunction;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(job: JobFunction, config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.job = job;
  }

  start(): void {
    if (!this.config.enabled) {
      console.info("Scheduler is disabled");
      return;
    }

    if (this.running) {
      console.info("Scheduler is already running");
      return;
    }

    this.running = true;
    console.info(
      `Scheduler started. Next run at ${String(this.config.hour).padStart(2, "0")}:${String(this.config.minute).padStart(2, "0")} UTC`
    );
    this.scheduleNextRun();
  }

  stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.running = false;
    console.info("Scheduler stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getNextRunTime(): Date | null {
    if (!this.running) return null;
    return this.calculateNextRunTime();
  }

  private calculateNextRunTime(): Date {
    const now = new Date();
    const next = new Date(now);

    next.setUTCHours(this.config.hour, this.config.minute, 0, 0);

    // If the scheduled time has passed today, schedule for tomorrow
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    return next;
  }

  private scheduleNextRun(): void {
    if (!this.running) return;

    const next = this.calculateNextRunTime();
    const delay = next.getTime() - Date.now();

    console.info(
      `Next job scheduled for ${next.toISOString()} (in ${String(Math.round(delay / 1000 / 60))} minutes)`
    );

    this.timerId = setTimeout(() => {
      void this.executeJob();
    }, delay);
  }

  private async executeJob(): Promise<void> {
    console.info("Executing scheduled job...");
    const startTime = Date.now();

    try {
      await this.job();
      const duration = Date.now() - startTime;
      console.info(`Job completed in ${String(duration)}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Job failed: ${message}`);
    }

    // Schedule next run
    this.scheduleNextRun();
  }

  // For testing - run job immediately
  async runNow(): Promise<void> {
    await this.executeJob();
  }
}
