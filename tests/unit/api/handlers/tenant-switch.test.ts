/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression */
import { describe, test, expect, mock, type Mock } from "bun:test";
import {
  handleTenantSwitch,
  TenantSwitchError,
  type TenantSwitchDeps,
} from "../../../../src/api/handlers/tenant-switch";
import type { SessionRepository } from "../../../../src/db/repositories/session";
import type { UserRepository } from "../../../../src/db/repositories/user";
import type { UserTenantsRepository } from "../../../../src/db/repositories/user-tenants";

interface MockDeps {
  sessionRepo: {
    updateCurrentTenant: Mock<() => Promise<unknown>>;
  };
  userRepo: {
    updateLastTenant: Mock<() => Promise<unknown>>;
  };
  userTenantsRepo: {
    hasAccess: Mock<() => Promise<boolean>>;
  };
}

function createMockDeps(): { deps: TenantSwitchDeps; mocks: MockDeps } {
  const mocks: MockDeps = {
    sessionRepo: {
      updateCurrentTenant: mock(() =>
        Promise.resolve({ current_tenant_id: "tenant-456" })
      ),
    },
    userRepo: {
      updateLastTenant: mock(() => Promise.resolve({})),
    },
    userTenantsRepo: {
      hasAccess: mock(() => Promise.resolve(true)),
    },
  };

  const deps: TenantSwitchDeps = {
    sessionRepo: mocks.sessionRepo as unknown as SessionRepository,
    userRepo: mocks.userRepo as unknown as UserRepository,
    userTenantsRepo: mocks.userTenantsRepo as unknown as UserTenantsRepository,
  };

  return { deps, mocks };
}

describe("handleTenantSwitch", () => {
  describe("successful switch", () => {
    test("switches to tenant user has access to", async () => {
      const { deps, mocks } = createMockDeps();

      const result = await handleTenantSwitch(
        { tenantId: "tenant-456" },
        { userId: "user-123", sessionToken: "token-abc" },
        deps
      );

      expect(result.success).toBe(true);
      expect(mocks.userTenantsRepo.hasAccess).toHaveBeenCalledWith(
        "user-123",
        "tenant-456"
      );
    });

    test("updates session current tenant", async () => {
      const { deps, mocks } = createMockDeps();

      await handleTenantSwitch(
        { tenantId: "tenant-456" },
        { userId: "user-123", sessionToken: "token-abc" },
        deps
      );

      expect(mocks.sessionRepo.updateCurrentTenant).toHaveBeenCalledWith(
        "token-abc",
        "tenant-456"
      );
    });

    test("updates user last tenant", async () => {
      const { deps, mocks } = createMockDeps();

      await handleTenantSwitch(
        { tenantId: "tenant-456" },
        { userId: "user-123", sessionToken: "token-abc" },
        deps
      );

      expect(mocks.userRepo.updateLastTenant).toHaveBeenCalledWith(
        "user-123",
        "tenant-456"
      );
    });
  });

  describe("access denied", () => {
    test("throws TenantSwitchError if user has no access to tenant", async () => {
      const { deps, mocks } = createMockDeps();
      mocks.userTenantsRepo.hasAccess.mockResolvedValue(false);

      await expect(
        handleTenantSwitch(
          { tenantId: "tenant-456" },
          { userId: "user-123", sessionToken: "token-abc" },
          deps
        )
      ).rejects.toThrow(TenantSwitchError);

      await expect(
        handleTenantSwitch(
          { tenantId: "tenant-456" },
          { userId: "user-123", sessionToken: "token-abc" },
          deps
        )
      ).rejects.toThrow("No access to tenant");
    });

    test("does not update session or user when access denied", async () => {
      const { deps, mocks } = createMockDeps();
      mocks.userTenantsRepo.hasAccess.mockResolvedValue(false);

      await handleTenantSwitch(
        { tenantId: "tenant-456" },
        { userId: "user-123", sessionToken: "token-abc" },
        deps
      ).catch(() => {});

      expect(mocks.sessionRepo.updateCurrentTenant).not.toHaveBeenCalled();
      expect(mocks.userRepo.updateLastTenant).not.toHaveBeenCalled();
    });
  });

  describe("TenantSwitchError", () => {
    test("has correct name", () => {
      const error = new TenantSwitchError("Test error");
      expect(error.name).toBe("TenantSwitchError");
      expect(error.message).toBe("Test error");
    });

    test("is instance of Error", () => {
      const error = new TenantSwitchError("Test");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
