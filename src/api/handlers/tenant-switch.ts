import type { SessionRepository } from "../../db/repositories/session";
import type { UserRepository } from "../../db/repositories/user";
import type { UserTenantsRepository } from "../../db/repositories/user-tenants";

export interface TenantSwitchDeps {
  sessionRepo: SessionRepository;
  userRepo: UserRepository;
  userTenantsRepo: UserTenantsRepository;
}

export interface TenantSwitchInput {
  tenantId: string;
}

export interface TenantSwitchContext {
  userId: string;
  sessionToken: string;
}

export class TenantSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantSwitchError";
  }
}

export async function handleTenantSwitch(
  input: TenantSwitchInput,
  context: TenantSwitchContext,
  deps: TenantSwitchDeps
): Promise<{ success: true }> {
  // Check if user has access to this tenant
  const hasAccess = await deps.userTenantsRepo.hasAccess(
    context.userId,
    input.tenantId
  );
  if (!hasAccess) {
    throw new TenantSwitchError("No access to tenant");
  }

  // Update session's current tenant
  await deps.sessionRepo.updateCurrentTenant(
    context.sessionToken,
    input.tenantId
  );

  // Update user's last tenant for next login
  await deps.userRepo.updateLastTenant(context.userId, input.tenantId);

  return { success: true };
}
