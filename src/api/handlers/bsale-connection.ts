import type { BsaleOAuthClient } from "@/bsale/oauth-client";
import type { TenantRepository } from "@/db/repositories/tenant";
import type { OAuthStateStore } from "@/utils/oauth-state-store";
import { generatePKCE, generateState } from "@/utils/pkce";

export interface BsaleConnectionDeps {
  oauthClient: BsaleOAuthClient;
  tenantRepo: TenantRepository;
  stateStore: OAuthStateStore;
}

export interface ConnectStartRequest {
  tenantId: string;
  clientCode: string;
}

export interface ConnectStartResult {
  authorizationUrl: string;
  state: string;
}

export interface ConnectCallbackRequest {
  code: string;
  state: string;
}

export interface ConnectCallbackResult {
  tenantId: string;
  clientCode: string;
  clientName: string;
}

/**
 * Start Bsale OAuth connection for an existing tenant
 */
export function handleBsaleConnectStart(
  request: ConnectStartRequest,
  deps: BsaleConnectionDeps
): ConnectStartResult {
  const { tenantId, clientCode } = request;

  if (!tenantId) {
    throw new BsaleConnectionError("tenantId is required");
  }

  if (!clientCode || clientCode.trim().length === 0) {
    throw new BsaleConnectionError("client_code is required");
  }

  // Generate PKCE challenge and CSRF state
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();

  // Store state with tenantId for connection flow
  deps.stateStore.set(state, { codeVerifier, clientCode, tenantId });

  const authorizationUrl = deps.oauthClient.getAuthorizationUrl(
    clientCode,
    state,
    codeChallenge
  );

  return { authorizationUrl, state };
}

/**
 * Handle Bsale OAuth callback for connection flow
 * Updates existing tenant with Bsale credentials
 */
export async function handleBsaleConnectCallback(
  request: ConnectCallbackRequest,
  deps: BsaleConnectionDeps
): Promise<ConnectCallbackResult> {
  const { code, state } = request;

  if (!code || code.trim().length === 0) {
    throw new BsaleConnectionError("authorization code is required");
  }

  if (!state || state.trim().length === 0) {
    throw new BsaleConnectionError("state parameter is required");
  }

  // Validate and consume state (one-time use)
  const stateData = deps.stateStore.consume(state);
  if (!stateData) {
    throw new BsaleConnectionError("invalid or expired state parameter");
  }

  const tenantId = stateData.tenantId;
  if (!tenantId) {
    throw new BsaleConnectionError("missing tenantId in state");
  }

  // Verify tenant exists
  const existingTenant = await deps.tenantRepo.getById(tenantId);
  if (!existingTenant) {
    throw new BsaleConnectionError("tenant not found");
  }

  // Exchange code for access token with PKCE code_verifier
  const tokenResponse = await deps.oauthClient.exchangeCodeForToken(
    code,
    stateData.codeVerifier
  );

  // Check if another tenant is already using this Bsale client code
  const conflictingTenant = await deps.tenantRepo.findByClientCode(
    tokenResponse.data.clientCode
  );

  if (conflictingTenant && conflictingTenant.id !== tenantId) {
    throw new BsaleConnectionError(
      "Este codigo de cliente ya esta conectado a otra cuenta"
    );
  }

  // Connect Bsale to the existing tenant
  await deps.tenantRepo.connectBsale(tenantId, {
    clientCode: tokenResponse.data.clientCode,
    clientName: tokenResponse.data.clientName,
    accessToken: tokenResponse.data.accessToken,
  });

  return {
    tenantId,
    clientCode: tokenResponse.data.clientCode,
    clientName: tokenResponse.data.clientName,
  };
}

/**
 * Disconnect Bsale from a tenant
 */
export async function handleBsaleDisconnect(
  tenantId: string,
  deps: BsaleConnectionDeps
): Promise<void> {
  if (!tenantId) {
    throw new BsaleConnectionError("tenantId is required");
  }

  const tenant = await deps.tenantRepo.getById(tenantId);
  if (!tenant) {
    throw new BsaleConnectionError("tenant not found");
  }

  await deps.tenantRepo.disconnectBsale(tenantId);
}

export class BsaleConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BsaleConnectionError";
  }
}
