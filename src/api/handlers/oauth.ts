import type { BsaleOAuthClient } from "../../bsale/oauth-client";
import type { TenantRepository } from "../../db/repositories/tenant";
import type { UserRepository } from "../../db/repositories/user";
import type { SessionRepository } from "../../db/repositories/session";
import type { UserTenantsRepository } from "../../db/repositories/user-tenants";
import type { OAuthStateStore } from "../../utils/oauth-state-store";
import { randomBytes } from "node:crypto";
import { generatePKCE, generateState } from "../../utils/pkce";

export interface OAuthHandlerDeps {
  oauthClient: BsaleOAuthClient;
  tenantRepo: TenantRepository;
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  stateStore: OAuthStateStore;
  userTenantsRepo?: UserTenantsRepository;
}

export interface OAuthStartRequest {
  clientCode: string;
}

export interface OAuthStartResult {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackRequest {
  code: string;
  state: string;
  authenticatedUserId?: string; // Set if user is already logged in (Add Tenant flow)
}

export interface SessionData {
  sessionToken: string;
  userId: string;
  tenantId: string;
}

/**
 * Handle OAuth start: redirect user to Bsale authorization page
 * Generates PKCE challenge and CSRF state for security
 */
export function handleOAuthStart(
  request: OAuthStartRequest,
  deps: OAuthHandlerDeps
): OAuthStartResult {
  const { clientCode } = request;

  if (!clientCode || clientCode.trim().length === 0) {
    throw new OAuthError("client_code is required");
  }

  // Generate PKCE challenge and CSRF state
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();

  // Store state and code_verifier for validation in callback
  deps.stateStore.set(state, { codeVerifier, clientCode });

  const authorizationUrl = deps.oauthClient.getAuthorizationUrl(
    clientCode,
    state,
    codeChallenge
  );

  return { authorizationUrl, state };
}

/**
 * Handle OAuth callback: exchange code for token, create/update tenant, create session
 * Validates CSRF state and uses PKCE code_verifier for security
 *
 * Supports two flows:
 * 1. New signup: Creates tenant, user, and session
 * 2. Add tenant: Authenticated user adds a new Bsale account (authenticatedUserId provided)
 */
export async function handleOAuthCallback(
  request: OAuthCallbackRequest,
  deps: OAuthHandlerDeps
): Promise<SessionData> {
  const { code, state, authenticatedUserId } = request;

  if (!code || code.trim().length === 0) {
    throw new OAuthError("authorization code is required");
  }

  if (!state || state.trim().length === 0) {
    throw new OAuthError("state parameter is required");
  }

  // Validate and consume state (one-time use)
  const stateData = deps.stateStore.consume(state);
  if (!stateData) {
    throw new OAuthError("invalid or expired state parameter");
  }

  // Exchange code for access token with PKCE code_verifier
  const tokenResponse = await deps.oauthClient.exchangeCodeForToken(
    code,
    stateData.codeVerifier
  );

  // Check if tenant already exists
  let tenant = await deps.tenantRepo.findByClientCode(
    tokenResponse.data.clientCode
  );

  const userEmail = `admin@${tokenResponse.data.clientCode}`;
  let user: Awaited<ReturnType<typeof deps.userRepo.getByEmail>> = null;
  let isNewTenant = false;

  // Add Tenant flow: authenticated user adding a new Bsale account
  if (authenticatedUserId) {
    if (tenant) {
      // Tenant exists - check if it's owned by same user or add user to tenant
      if (tenant.owner_id !== authenticatedUserId) {
        // Check if user already has access
        const hasAccess = deps.userTenantsRepo
          ? await deps.userTenantsRepo.hasAccess(authenticatedUserId, tenant.id)
          : false;

        if (!hasAccess) {
          throw new OAuthError(
            "This Bsale account is already connected to another user"
          );
        }
      }

      // Update existing tenant with new access token
      tenant = await deps.tenantRepo.update(tenant.id, {
        bsale_access_token: tokenResponse.data.accessToken,
        bsale_client_name: tokenResponse.data.clientName,
      });
    } else {
      // Create new tenant for authenticated user
      tenant = await deps.tenantRepo.create({
        owner_id: authenticatedUserId,
        bsale_client_code: tokenResponse.data.clientCode,
        bsale_client_name: tokenResponse.data.clientName,
        bsale_access_token: tokenResponse.data.accessToken,
      });
      isNewTenant = true;
    }

    // Get the authenticated user
    user = await deps.userRepo.getById(authenticatedUserId);
    if (!user) {
      throw new OAuthError("Authenticated user not found");
    }

    // Create user_tenants entry if userTenantsRepo is available and this is a new tenant
    if (deps.userTenantsRepo && isNewTenant) {
      await deps.userTenantsRepo.create({
        user_id: authenticatedUserId,
        tenant_id: tenant.id,
        role: "owner",
      });
    }

    // Return without creating new session (user is already authenticated)
    return {
      sessionToken: "", // No new session needed
      userId: user.id,
      tenantId: tenant.id,
    };
  }

  // Standard signup flow
  if (tenant) {
    // Update existing tenant with new access token
    tenant = await deps.tenantRepo.update(tenant.id, {
      bsale_access_token: tokenResponse.data.accessToken,
      bsale_client_name: tokenResponse.data.clientName,
    });

    // Find or create user for existing tenant
    user = await deps.userRepo.getByEmail(tenant.id, userEmail);
    user ??= await deps.userRepo.create({
      tenant_id: tenant.id,
      email: userEmail,
      name: tokenResponse.data.clientName,
      notification_enabled: true,
    });
  } else {
    // Check if user already exists (e.g., from magic link signup)
    user = await deps.userRepo.getByEmail("", userEmail); // Check globally

    if (user) {
      // User exists but no tenant yet - create tenant with existing user as owner
      tenant = await deps.tenantRepo.create({
        owner_id: user.id,
        bsale_client_code: tokenResponse.data.clientCode,
        bsale_client_name: tokenResponse.data.clientName,
        bsale_access_token: tokenResponse.data.accessToken,
      });
      isNewTenant = true;
    } else {
      // New signup flow: Create tenant first with a placeholder owner,
      // then create user and update tenant's owner_id
      const pendingOwnerId = "00000000-0000-0000-0000-000000000000";

      tenant = await deps.tenantRepo.create({
        owner_id: pendingOwnerId,
        bsale_client_code: tokenResponse.data.clientCode,
        bsale_client_name: tokenResponse.data.clientName,
        bsale_access_token: tokenResponse.data.accessToken,
      });

      // Create user with the new tenant
      user = await deps.userRepo.create({
        tenant_id: tenant.id,
        email: userEmail,
        name: tokenResponse.data.clientName,
        notification_enabled: true,
      });
      isNewTenant = true;

      // Update tenant's owner_id to the newly created user
      tenant = await deps.tenantRepo.updateOwner(tenant.id, user.id);
    }
  }

  // Create user_tenants entry if userTenantsRepo is available and this is a new tenant
  if (deps.userTenantsRepo && isNewTenant) {
    await deps.userTenantsRepo.create({
      user_id: user.id,
      tenant_id: tenant.id,
      role: "owner",
    });
  }

  // Create session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days (sliding window will extend)

  await deps.sessionRepo.create({
    userId: user.id,
    token: sessionToken,
    expiresAt,
    currentTenantId: tenant.id,
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
