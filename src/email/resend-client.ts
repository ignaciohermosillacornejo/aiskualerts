import { Resend } from "resend";
import type { Config } from "@/config";
import { logger } from "@/utils/logger";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface EmailClient {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("rate limit")
    );
  }
  return false;
}

export function createEmailClient(config: Config): EmailClient {
  const apiKey = config.resendApiKey;
  const fromEmail = config.notificationFromEmail ?? "alerts@aiskualerts.com";

  if (!apiKey) {
    return {
      sendEmail(): Promise<SendEmailResult> {
        logger.warn("Email sending skipped: RESEND_API_KEY not configured");
        return Promise.resolve({ success: false, error: "API key not configured" });
      },
    };
  }

  const resend = new Resend(apiKey);

  return {
    async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await resend.emails.send({
            from: fromEmail,
            to: params.to,
            subject: params.subject,
            html: params.html,
          });

          if (result.error) {
            throw new Error(result.error.message);
          }

          return {
            success: true,
            id: result.data.id,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < MAX_RETRIES && isRetryableError(error)) {
            const delayMs = RETRY_DELAY_MS * attempt;
            logger.warn("Email send attempt failed, retrying", {
              attempt,
              retryDelayMs: delayMs,
              error: lastError.message,
            });
            await delay(delayMs);
            continue;
          }

          break;
        }
      }

      logger.error("Email send failed after all retries", lastError ?? undefined, { error: lastError?.message });
      return {
        success: false,
        error: lastError?.message ?? "Unknown error",
      };
    },
  };
}
