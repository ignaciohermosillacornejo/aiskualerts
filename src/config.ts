import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  // CORS configuration - comma-separated list of allowed origins
  allowedOrigins: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return [];
      return val.split(",").map((origin) => origin.trim()).filter(Boolean);
    }),
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
  // Stripe billing configuration
  stripeSecretKey: z.string().optional(),
  stripePriceId: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  appUrl: z.url().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const nodeEnv = env["NODE_ENV"] ?? "development";

  // Validate ALLOWED_ORIGINS is set in production
  if (nodeEnv === "production" && !env["ALLOWED_ORIGINS"]) {
    throw new Error(
      "ALLOWED_ORIGINS environment variable must be configured in production. " +
      "Set it to a comma-separated list of allowed origins (e.g., 'https://example.com,https://app.example.com')"
    );
  }

  return configSchema.parse({
    port: env["PORT"],
    nodeEnv: env["NODE_ENV"],
    allowedOrigins: env["ALLOWED_ORIGINS"],
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
    // Stripe billing configuration
    stripeSecretKey: env["STRIPE_SECRET_KEY"],
    stripePriceId: env["STRIPE_PRICE_ID"],
    stripeWebhookSecret: env["STRIPE_WEBHOOK_SECRET"],
    appUrl: env["APP_URL"],
  });
}
