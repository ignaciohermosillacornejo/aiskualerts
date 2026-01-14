import type { Config } from "../../src/config";

/**
 * Default test configuration with all required properties.
 * Merge with partial config in tests: { ...createTestConfig(), ...overrides }
 */
export function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    port: 3000,
    nodeEnv: "test" as const,
    allowedOrigins: [],
    syncEnabled: false,
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
    ...overrides,
  };
}
