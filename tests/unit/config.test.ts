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
    const config = loadConfig({ NODE_ENV: "production" });

    expect(config.nodeEnv).toBe("production");
  });

  test("accepts all valid NODE_ENV values", () => {
    const devConfig = loadConfig({ NODE_ENV: "development" });
    expect(devConfig.nodeEnv).toBe("development");

    const prodConfig = loadConfig({ NODE_ENV: "production" });
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
});
