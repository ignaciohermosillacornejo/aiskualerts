import { randomBytes } from "node:crypto";
import type { MagicLinkRepository } from "@/db/repositories/magic-link";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { UserRepository } from "@/db/repositories/user";
import type { SessionRepository } from "@/db/repositories/session";
import type { EmailClient } from "@/email/resend-client";
import { renderMagicLinkEmail } from "@/email/templates/magic-link";
import { logger } from "@/utils/logger";

export interface MagicLinkHandlerDeps {
  magicLinkRepo: MagicLinkRepository;
  tenantRepo: TenantRepository;
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  emailClient: EmailClient;
  config: {
    appUrl: string;
    magicLinkExpiryMinutes: number;
    magicLinkRateLimitPerHour: number;
  };
}

export interface MagicLinkRequestInput {
  email: string;
}

export interface MagicLinkRequestResult {
  success: boolean;
  message: string;
}

export interface MagicLinkVerifyInput {
  token: string;
}

export interface SessionData {
  sessionToken: string;
  userId: string;
  tenantId: string;
}

/**
 * Handle magic link request: generate token and send email
 * Rate limited per email address
 */
export async function handleMagicLinkRequest(
  input: MagicLinkRequestInput,
  deps: MagicLinkHandlerDeps
): Promise<MagicLinkRequestResult> {
  const { email } = input;
  const normalizedEmail = email.toLowerCase().trim();

  // Always return the same response to prevent email enumeration
  const successResponse: MagicLinkRequestResult = {
    success: true,
    message: "Si el correo existe en nuestro sistema, recibiras un enlace de acceso.",
  };

  // Validate email format
  if (!isValidEmail(normalizedEmail)) {
    logger.warn("Invalid email format for magic link request", { email: normalizedEmail });
    return successResponse; // Don't reveal invalid email
  }

  // Check rate limit (e.g., max 5 requests per hour per email)
  const recentCount = await deps.magicLinkRepo.countRecentByEmail(normalizedEmail, 60);
  if (recentCount >= deps.config.magicLinkRateLimitPerHour) {
    logger.warn("Rate limit exceeded for magic link", { email: normalizedEmail, recentCount });
    return successResponse; // Don't reveal rate limiting
  }

  // Generate secure token
  const token = generateMagicLinkToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + deps.config.magicLinkExpiryMinutes);

  // Store token
  await deps.magicLinkRepo.create({
    email: normalizedEmail,
    token,
    expiresAt,
  });

  // Generate magic link URL
  const magicLinkUrl = `${deps.config.appUrl}/api/auth/magic-link/verify?token=${token}`;

  // Send email
  const emailHtml = renderMagicLinkEmail({
    email: normalizedEmail,
    magicLinkUrl,
    expiresInMinutes: deps.config.magicLinkExpiryMinutes,
  });

  const emailResult = await deps.emailClient.sendEmail({
    to: normalizedEmail,
    subject: "Inicia sesion en AISku Alerts",
    html: emailHtml,
  });

  if (!emailResult.success) {
    logger.error("Failed to send magic link email", new Error(emailResult.error), {
      email: normalizedEmail,
    });
    // Still return success to prevent enumeration
  } else {
    logger.info("Magic link email sent", { email: normalizedEmail });
  }

  return successResponse;
}

/**
 * Handle magic link verification: validate token, create/find user, create session
 */
export async function handleMagicLinkVerify(
  input: MagicLinkVerifyInput,
  deps: MagicLinkHandlerDeps
): Promise<SessionData> {
  const { token } = input;

  if (!token || token.trim().length === 0) {
    throw new MagicLinkError("Token is required");
  }

  // Find valid token
  const magicLinkToken = await deps.magicLinkRepo.findValidToken(token);
  if (!magicLinkToken) {
    throw new MagicLinkError("Invalid or expired token");
  }

  // Mark token as used immediately (one-time use)
  await deps.magicLinkRepo.markUsed(magicLinkToken.id);

  const email = magicLinkToken.email;

  // Find existing tenant by user email
  let tenant = await deps.tenantRepo.findByUserEmail(email);
  let user = tenant ? await deps.userRepo.getByEmail(tenant.id, email) : null;

  if (!tenant) {
    // For new signups, create tenant with placeholder owner, then user
    const pendingOwnerId = "00000000-0000-0000-0000-000000000000";
    tenant = await deps.tenantRepo.createForMagicLink(pendingOwnerId, email);
    logger.info("Created new tenant for magic link user", { email, tenantId: tenant.id });

    // Create user
    user = await deps.userRepo.create({
      tenant_id: tenant.id,
      email,
      notification_enabled: true,
    });
    logger.info("Created new user for magic link", { email, userId: user.id });

    // TODO: Update tenant.owner_id to user.id once we add updateOwner method
  } else if (!user) {
    // Tenant exists but user doesn't (shouldn't happen normally)
    user = await deps.userRepo.create({
      tenant_id: tenant.id,
      email,
      notification_enabled: true,
    });
    logger.info("Created new user for magic link", { email, userId: user.id });
  }

  // Create session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days (sliding window will extend)

  await deps.sessionRepo.create({
    userId: user.id,
    token: sessionToken,
    expiresAt,
  });

  logger.info("Magic link verified, session created", { email, userId: user.id });

  return {
    sessionToken,
    userId: user.id,
    tenantId: tenant.id,
  };
}

/**
 * Generate a cryptographically secure magic link token
 */
function generateMagicLinkToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a cryptographically secure session token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Basic email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export class MagicLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MagicLinkError";
  }
}
