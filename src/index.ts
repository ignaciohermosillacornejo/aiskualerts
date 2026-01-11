import { loadConfig } from "@/config";
import { createServer } from "@/server";
import { Scheduler } from "@/scheduler";
import { getDb } from "@/db/client";
import { createSyncJob } from "@/jobs/sync-job";

function main(): void {
  const config = loadConfig();

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

  // Start the HTTP server
  const server = createServer(config);
  console.info(`HTTP server listening on port ${String(server.port)}`);

  // Start the scheduler
  scheduler.start();

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.info("Shutting down...");

    scheduler.stop();
    await server.stop(true);
    await db.close();

    console.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main();
