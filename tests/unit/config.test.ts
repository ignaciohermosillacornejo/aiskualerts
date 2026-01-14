import { test, expect, describe } from "bun:test";
import { loadConfig, type Config } from "@/config";

describe("loadConfig", () => {
  test("returns default values when env is empty", () => {
    const config = loadConfig({});

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe("development");
  });

  test("parses PORT from environment", () => {
    const config = loadConfig({ PORT: "8080" });

    expect(config.port).toBe(8080);
  });

  test("parses NODE_ENV from environment", () => {
    const config = loadConfig({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://example.com" });

    expect(config.nodeEnv).toBe("production");
  });

  test("accepts all valid NODE_ENV values", () => {
    const devConfig = loadConfig({ NODE_ENV: "development" });
    expect(devConfig.nodeEnv).toBe("development");

    const prodConfig = loadConfig({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://example.com" });
    expect(prodConfig.nodeEnv).toBe("production");

    const testConfig = loadConfig({ NODE_ENV: "test" });
    expect(testConfig.nodeEnv).toBe("test");
  });

  test("throws on invalid PORT (non-numeric)", () => {
    expect(() => loadConfig({ PORT: "invalid" })).toThrow();
  });

  test("throws on invalid PORT (out of range - too low)", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow();
  });

  test("throws on invalid PORT (out of range - too high)", () => {
    expect(() => loadConfig({ PORT: "99999" })).toThrow();
  });

  test("throws on invalid NODE_ENV", () => {
    expect(() => loadConfig({ NODE_ENV: "invalid" })).toThrow();
  });

  test("returns correct Config type", () => {
    const config: Config = loadConfig({
      PORT: "4000",
      NODE_ENV: "test",
    });

    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe("test");
  });

  test("handles undefined values gracefully", () => {
    const config = loadConfig({
      PORT: undefined,
      NODE_ENV: undefined,
    });

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe("development");
  });

  test("coerces string port to number", () => {
    const config = loadConfig({ PORT: "3001" });

    expect(typeof config.port).toBe("number");
    expect(config.port).toBe(3001);
  });

  test("returns default sync config values", () => {
    const config = loadConfig({});

    expect(config.syncEnabled).toBe(true);
    expect(config.syncHour).toBe(2);
    expect(config.syncMinute).toBe(0);
    expect(config.syncBatchSize).toBe(100);
    expect(config.syncTenantDelay).toBe(5000);
  });

  test("parses sync config from environment", () => {
    const config = loadConfig({
      SYNC_ENABLED: "false",
      SYNC_HOUR: "10",
      SYNC_MINUTE: "30",
      SYNC_BATCH_SIZE: "50",
      SYNC_TENANT_DELAY_MS: "3000",
    });

    expect(config.syncEnabled).toBe(false);
    expect(config.syncHour).toBe(10);
    expect(config.syncMinute).toBe(30);
    expect(config.syncBatchSize).toBe(50);
    expect(config.syncTenantDelay).toBe(3000);
  });

  test("throws on invalid sync hour (out of range)", () => {
    expect(() => loadConfig({ SYNC_HOUR: "25" })).toThrow();
  });

  test("throws on invalid sync minute (out of range)", () => {
    expect(() => loadConfig({ SYNC_MINUTE: "60" })).toThrow();
  });

  test("returns default Sentry config values", () => {
    const config = loadConfig({});

    expect(config.sentryDsn).toBeUndefined();
    expect(config.sentryEnvironment).toBe("development");
  });

  test("parses Sentry config from environment", () => {
    const config = loadConfig({
      SENTRY_DSN: "https://abc123@sentry.io/456",
      SENTRY_ENVIRONMENT: "production",
    });

    expect(config.sentryDsn).toBe("https://abc123@sentry.io/456");
    expect(config.sentryEnvironment).toBe("production");
  });

  test("handles undefined Sentry DSN", () => {
    const config = loadConfig({
      SENTRY_ENVIRONMENT: "staging",
    });

    expect(config.sentryDsn).toBeUndefined();
    expect(config.sentryEnvironment).toBe("staging");
  });

  describe("ALLOWED_ORIGINS", () => {
    test("returns empty array when not set", () => {
      const config = loadConfig({});

      expect(config.allowedOrigins).toEqual([]);
    });

    test("parses single origin", () => {
      const config = loadConfig({
        ALLOWED_ORIGINS: "https://example.com",
      });

      expect(config.allowedOrigins).toEqual(["https://example.com"]);
    });

    test("parses multiple comma-separated origins", () => {
      const config = loadConfig({
        ALLOWED_ORIGINS: "https://example.com,https://app.example.com,https://api.example.com",
      });

      expect(config.allowedOrigins).toEqual([
        "https://example.com",
        "https://app.example.com",
        "https://api.example.com",
      ]);
    });

    test("trims whitespace from origins", () => {
      const config = loadConfig({
        ALLOWED_ORIGINS: " https://example.com , https://app.example.com ",
      });

      expect(config.allowedOrigins).toEqual([
        "https://example.com",
        "https://app.example.com",
      ]);
    });

    test("filters out empty origins", () => {
      const config = loadConfig({
        ALLOWED_ORIGINS: "https://example.com,,https://app.example.com,",
      });

      expect(config.allowedOrigins).toEqual([
        "https://example.com",
        "https://app.example.com",
      ]);
    });

    test("handles empty string as empty array", () => {
      const config = loadConfig({
        ALLOWED_ORIGINS: "",
      });

      expect(config.allowedOrigins).toEqual([]);
    });

    test("handles whitespace-only string as empty array", () => {
      const config = loadConfig({
        ALLOWED_ORIGINS: "   ",
      });

      expect(config.allowedOrigins).toEqual([]);
    });

    test("throws in production mode without ALLOWED_ORIGINS", () => {
      expect(() =>
        loadConfig({
          NODE_ENV: "production",
        })
      ).toThrow("ALLOWED_ORIGINS environment variable must be configured in production");
    });

    test("throws in production mode with empty ALLOWED_ORIGINS", () => {
      expect(() =>
        loadConfig({
          NODE_ENV: "production",
          ALLOWED_ORIGINS: "",
        })
      ).toThrow("ALLOWED_ORIGINS environment variable must be configured in production");
    });

    test("does not throw in production mode with ALLOWED_ORIGINS set", () => {
      const config = loadConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://example.com",
      });

      expect(config.nodeEnv).toBe("production");
      expect(config.allowedOrigins).toEqual(["https://example.com"]);
    });

    test("does not throw in development mode without ALLOWED_ORIGINS", () => {
      const config = loadConfig({
        NODE_ENV: "development",
      });

      expect(config.nodeEnv).toBe("development");
      expect(config.allowedOrigins).toEqual([]);
    });

    test("does not throw in test mode without ALLOWED_ORIGINS", () => {
      const config = loadConfig({
        NODE_ENV: "test",
      });

      expect(config.nodeEnv).toBe("test");
      expect(config.allowedOrigins).toEqual([]);
    });
  });
});
