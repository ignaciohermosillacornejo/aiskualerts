import { test, expect, describe, mock, afterEach } from "bun:test";
import { Scheduler } from "@/scheduler/scheduler";

describe("Scheduler", () => {
  let scheduler: Scheduler | null = null;

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
      scheduler = null;
    }
  });

  describe("constructor", () => {
    test("creates scheduler with default config", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job);

      expect(scheduler.isRunning()).toBe(false);
    });

    test("creates scheduler with custom config", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job, { hour: 10, minute: 30 });

      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe("start", () => {
    test("starts the scheduler", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job);

      scheduler.start();

      expect(scheduler.isRunning()).toBe(true);
    });

    test("does not start if disabled", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job, { enabled: false });

      scheduler.start();

      expect(scheduler.isRunning()).toBe(false);
    });

    test("does not start twice", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job);

      scheduler.start();
      scheduler.start(); // Should not throw

      expect(scheduler.isRunning()).toBe(true);
    });
  });

  describe("stop", () => {
    test("stops the scheduler", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job);

      scheduler.start();
      scheduler.stop();

      expect(scheduler.isRunning()).toBe(false);
    });

    test("can be called when not running", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job);

      scheduler.stop(); // Should not throw

      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe("getNextRunTime", () => {
    test("returns null when not running", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job);

      expect(scheduler.getNextRunTime()).toBeNull();
    });

    test("returns next scheduled time when running", () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job, { hour: 2, minute: 0 });

      scheduler.start();
      const nextRun = scheduler.getNextRunTime();

      expect(nextRun).not.toBeNull();
      expect(nextRun?.getUTCHours()).toBe(2);
      expect(nextRun?.getUTCMinutes()).toBe(0);
    });
  });

  describe("runNow", () => {
    test("executes job immediately", async () => {
      const job = mock(() => Promise.resolve());
      scheduler = new Scheduler(job);

      await scheduler.runNow();

      expect(job).toHaveBeenCalled();
    });

    test("handles job errors gracefully", async () => {
      const job = mock(() => Promise.reject(new Error("Job failed")));
      scheduler = new Scheduler(job);

      // Should not throw
      await scheduler.runNow();

      expect(job).toHaveBeenCalled();
    });
  });
});
