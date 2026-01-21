import type { UserTenantsRepository } from "../../db/repositories/user-tenants";
import type { UserTenantRole } from "../../db/repositories/types";

export interface TenantsHandlerDeps {
  userTenantsRepo: UserTenantsRepository;
}

export interface GetTenantsInput {
  userId: string;
}

export interface TenantMembership {
  id: string;
  name: string | null;
  bsaleClientCode: string | null;
  role: UserTenantRole;
  syncStatus: string;
}

export interface GetTenantsResult {
  tenants: TenantMembership[];
}

export async function handleGetTenants(
  input: GetTenantsInput,
  deps: TenantsHandlerDeps
): Promise<GetTenantsResult> {
  const userTenants = await deps.userTenantsRepo.getTenantsForUser(input.userId);

  const tenants: TenantMembership[] = userTenants.map((ut) => ({
    id: ut.tenant_id,
    name: ut.tenant_name,
    bsaleClientCode: ut.bsale_client_code,
    role: ut.role,
    syncStatus: ut.sync_status,
  }));

  return { tenants };
}
