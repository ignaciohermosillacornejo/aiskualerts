import type { BsaleOAuthClient } from "../../bsale/oauth-client";
import type { TenantRepository } from "../../db/repositories/tenant";
import type { UserRepository } from "../../db/repositories/user";
import type { SessionRepository } from "../../db/repositories/session";
import { randomBytes } from "node:crypto";

export interface OAuthHandlerDeps {
  oauthClient: BsaleOAuthClient;
  tenantRepo: TenantRepository;
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
}

export interface OAuthStartRequest {
  clientCode: string;
}

export interface OAuthCallbackRequest {
  code: string;
}

export interface SessionData {
  sessionToken: string;
  userId: string;
  tenantId: string;
}

/**
 * Handle OAuth start: redirect user to Bsale authorization page
 */
export function handleOAuthStart(
  request: OAuthStartRequest,
  deps: OAuthHandlerDeps
): string {
  const { clientCode } = request;

  if (!clientCode || clientCode.trim().length === 0) {
    throw new OAuthError("client_code is required");
  }

  return deps.oauthClient.getAuthorizationUrl(clientCode);
}

/**
 * Handle OAuth callback: exchange code for token, create/update tenant, create session
 */
export async function handleOAuthCallback(
  request: OAuthCallbackRequest,
  deps: OAuthHandlerDeps
): Promise<SessionData> {
  const { code } = request;

  if (!code || code.trim().length === 0) {
    throw new OAuthError("authorization code is required");
  }

  // Exchange code for access token
  const tokenResponse = await deps.oauthClient.exchangeCodeForToken(code);

  // Check if tenant already exists
  let tenant = await deps.tenantRepo.findByClientCode(
    tokenResponse.data.clientCode
  );

  if (tenant) {
    // Update existing tenant with new access token
    tenant = await deps.tenantRepo.update(tenant.id, {
      bsale_access_token: tokenResponse.data.accessToken,
      bsale_client_name: tokenResponse.data.clientName,
    });
  } else {
    // Create new tenant
    tenant = await deps.tenantRepo.create({
      bsale_client_code: tokenResponse.data.clientCode,
      bsale_client_name: tokenResponse.data.clientName,
      bsale_access_token: tokenResponse.data.accessToken,
    });
  }

  // Find or create default user for this tenant
  // We use the tenant's client code as the default user email
  const userEmail = `admin@${tokenResponse.data.clientCode}`;
  let user = await deps.userRepo.getByEmail(tenant.id, userEmail);

  user ??= await deps.userRepo.create({
    tenant_id: tenant.id,
    email: userEmail,
    name: tokenResponse.data.clientName,
    notification_enabled: true,
  });

  // Create session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await deps.sessionRepo.create({
    userId: user.id,
    token: sessionToken,
    expiresAt,
  });

  return {
    sessionToken,
    userId: user.id,
    tenantId: tenant.id,
  };
}

/**
 * Generate a cryptographically secure session token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}
