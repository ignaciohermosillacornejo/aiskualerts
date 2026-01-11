import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  syncEnabled: z
    .string()
    .transform((val) => val.toLowerCase() === "true")
    .default("true"),
  syncHour: z.coerce.number().int().min(0).max(23).default(2),
  syncMinute: z.coerce.number().int().min(0).max(59).default(0),
  syncBatchSize: z.coerce.number().int().min(1).max(1000).default(100),
  syncTenantDelay: z.coerce.number().int().min(0).default(5000),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return configSchema.parse({
    port: env["PORT"],
    nodeEnv: env["NODE_ENV"],
    syncEnabled: env["SYNC_ENABLED"],
    syncHour: env["SYNC_HOUR"],
    syncMinute: env["SYNC_MINUTE"],
    syncBatchSize: env["SYNC_BATCH_SIZE"],
    syncTenantDelay: env["SYNC_TENANT_DELAY_MS"],
  });
}
