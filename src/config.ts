import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  syncEnabled: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true"),
  syncHour: z.coerce.number().int().min(0).max(23).default(2),
  syncMinute: z.coerce.number().int().min(0).max(59).default(0),
  syncBatchSize: z.coerce.number().int().min(1).max(1000).default(100),
  syncTenantDelay: z.coerce.number().int().min(0).default(5000),
  digestEnabled: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true"),
  digestHour: z.coerce.number().int().min(0).max(23).default(8),
  digestMinute: z.coerce.number().int().min(0).max(59).default(0),
  bsaleAppId: z.string().optional(),
  bsaleIntegratorToken: z.string().optional(),
  bsaleRedirectUri: z.string().optional(),
  bsaleOAuthBaseUrl: z.string().optional(),
  resendApiKey: z.string().optional(),
  notificationFromEmail: z.email().optional(),
  sentryDsn: z.string().optional(),
  sentryEnvironment: z.string().default("development"),
  // Security configuration
  tokenEncryptionKey: z.string().min(32).optional(),
  csrfTokenSecret: z.string().min(32).optional(),
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
    digestEnabled: env["DIGEST_ENABLED"],
    digestHour: env["DIGEST_HOUR"],
    digestMinute: env["DIGEST_MINUTE"],
    bsaleAppId: env["BSALE_APP_ID"],
    bsaleIntegratorToken: env["BSALE_INTEGRATOR_TOKEN"],
    bsaleRedirectUri: env["BSALE_REDIRECT_URI"],
    bsaleOAuthBaseUrl: env["BSALE_OAUTH_BASE_URL"],
    resendApiKey: env["RESEND_API_KEY"],
    notificationFromEmail: env["NOTIFICATION_FROM_EMAIL"],
    sentryDsn: env["SENTRY_DSN"],
    sentryEnvironment: env["SENTRY_ENVIRONMENT"],
    // Security configuration
    tokenEncryptionKey: env["TOKEN_ENCRYPTION_KEY"],
    csrfTokenSecret: env["CSRF_TOKEN_SECRET"],
  });
}
