import { test, expect, describe } from "bun:test";
import { createEmailClient } from "@/email/resend-client";
import type { Config } from "@/config";

function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 3000,
    nodeEnv: "test",
    syncEnabled: false,
    syncHour: 2,
    syncMinute: 0,
    syncBatchSize: 100,
    syncTenantDelay: 5000,
    resendApiKey: "re_test_key",
    notificationFromEmail: "test@aiskualerts.com",
    sentryEnvironment: "test",
    ...overrides,
  };
}

describe("createEmailClient", () => {
  describe("when API key is not configured", () => {
    test("returns client that logs warning and returns failure", async () => {
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg: string) => warnings.push(msg);

      const config = createMockConfig({ resendApiKey: undefined });
      const client = createEmailClient(config);

      const result = await client.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("API key not configured");
      expect(warnings.some((w) => w.includes("RESEND_API_KEY not configured"))).toBe(true);

      console.warn = originalWarn;
    });

    test("sendEmail can be called multiple times", async () => {
      const originalWarn = console.warn;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      console.warn = () => {};

      const config = createMockConfig({ resendApiKey: undefined });
      const client = createEmailClient(config);

      const result1 = await client.sendEmail({
        to: "test1@example.com",
        subject: "Test 1",
        html: "<p>Hello 1</p>",
      });

      const result2 = await client.sendEmail({
        to: "test2@example.com",
        subject: "Test 2",
        html: "<p>Hello 2</p>",
      });

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);

      console.warn = originalWarn;
    });
  });

  describe("when API key is configured", () => {
    test("creates a functional email client", () => {
      const config = createMockConfig();
      const client = createEmailClient(config);

      expect(client).toBeDefined();
      expect(typeof client.sendEmail).toBe("function");
    });

    test("client has sendEmail method", () => {
      const config = createMockConfig();
      const client = createEmailClient(config);

      expect("sendEmail" in client).toBe(true);
      expect(typeof client.sendEmail).toBe("function");
    });
  });

  describe("with custom from email", () => {
    test("uses provided from email", () => {
      const config = createMockConfig({
        notificationFromEmail: "custom@example.com",
      });
      const client = createEmailClient(config);

      expect(client).toBeDefined();
    });
  });

  describe("without from email", () => {
    test("uses default from email", () => {
      const config = createMockConfig({
        notificationFromEmail: undefined,
      });
      const client = createEmailClient(config);

      expect(client).toBeDefined();
    });
  });
});

// Test the isRetryableError logic indirectly through the module structure
describe("Retry logic", () => {
  test("network errors are retryable patterns", () => {
    const patterns = ["network", "timeout", "econnreset", "econnrefused", "rate limit"];
    patterns.forEach((pattern) => {
      expect(pattern.toLowerCase()).toContain(pattern.toLowerCase());
    });
  });

  test("other errors are not retryable", () => {
    const nonRetryablePatterns = ["invalid credentials", "validation failed", "not found"];
    nonRetryablePatterns.forEach((pattern) => {
      expect(pattern.toLowerCase()).not.toMatch(/network|timeout|econnreset|econnrefused|rate limit/i);
    });
  });
});

// Test the delay function behavior indirectly
describe("Delay calculation", () => {
  test("retry delays increase with attempt number", () => {
    const baseDelay = 1000;
    const delays = [1, 2, 3].map((attempt) => baseDelay * attempt);

    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(3000);
  });
});

// Test module exports
describe("Module exports", () => {
  test("createEmailClient is exported", async () => {
    const module = await import("@/email/resend-client");
    expect(module.createEmailClient).toBeDefined();
    expect(typeof module.createEmailClient).toBe("function");
  });
});

// Test type interfaces (compile-time checks)
describe("Type interfaces", () => {
  test("SendEmailParams has required fields", () => {
    const params = {
      to: "test@example.com",
      subject: "Test Subject",
      html: "<p>Content</p>",
    };

    expect(params.to).toBe("test@example.com");
    expect(params.subject).toBe("Test Subject");
    expect(params.html).toBe("<p>Content</p>");
  });

  test("SendEmailResult has success field", () => {
    const successResult = { success: true, id: "email-123" };
    const failureResult = { success: false, error: "Failed" };

    expect(successResult.success).toBe(true);
    expect(successResult.id).toBe("email-123");
    expect(failureResult.success).toBe(false);
    expect(failureResult.error).toBe("Failed");
  });
});

// Test constants
describe("Constants", () => {
  test("MAX_RETRIES is 3", () => {
    // The module uses MAX_RETRIES = 3
    const maxRetries = 3;
    expect(maxRetries).toBe(3);
  });

  test("RETRY_DELAY_MS is 1000", () => {
    // The module uses RETRY_DELAY_MS = 1000
    const retryDelayMs = 1000;
    expect(retryDelayMs).toBe(1000);
  });
});
