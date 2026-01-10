import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return configSchema.parse({
    port: env["PORT"],
    nodeEnv: env["NODE_ENV"],
  });
}
