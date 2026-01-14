import { test, expect, describe, mock } from "bun:test";
import {
  handleBsaleConnectStart,
  handleBsaleConnectCallback,
  handleBsaleDisconnect,
  BsaleConnectionError,
  type BsaleConnectionDeps,
} from "@/api/handlers/bsale-connection";

// Type for tenant data
type TenantData = {
  id: string;
  bsale_client_code: string | null;
  bsale_client_name: string | null;
  bsale_access_token: string | null;
  sync_status: string;
  created_at: Date;
  updated_at: Date;
} | null;

// Type for state data
type StateData = {
  codeVerifier: string;
  clientCode: string;
  tenantId?: string;
} | null;

// Mock dependencies factory
function createMocks() {
  const oauthClient = {
    getAuthorizationUrl: mock((clientCode: string, state: string, codeChallenge: string) =>
      `https://api.bsale.io/oauth/authorize?client_code=${clientCode}&state=${state}&code_challenge=${codeChallenge}`
    ),
    exchangeCodeForToken: mock(() =>
      Promise.resolve({
        data: {
          accessToken: "access-token-123",
          clientCode: "mycompany",
          clientName: "My Company",
        },
      })
    ),
  };

  const tenantRepo = {
    getById: mock((): Promise<TenantData> =>
      Promise.resolve({
        id: "tenant-1",
        bsale_client_code: null,
        bsale_client_name: null,
        bsale_access_token: null,
        sync_status: "not_connected",
        created_at: new Date(),
        updated_at: new Date(),
      })
    ),
    findByClientCode: mock((): Promise<TenantData> => Promise.resolve(null)),
    connectBsale: mock(() => Promise.resolve()),
    disconnectBsale: mock(() => Promise.resolve()),
  };

  const stateStore = {
    set: mock(() => {}),
    consume: mock((): StateData => ({
      codeVerifier: "verifier-123",
      clientCode: "mycompany",
      tenantId: "tenant-1",
    })),
  };

  const deps: BsaleConnectionDeps = {
    oauthClient,
    tenantRepo,
    stateStore,
  } as unknown as BsaleConnectionDeps;

  return { deps, oauthClient, tenantRepo, stateStore };
}

describe("handleBsaleConnectStart", () => {
  describe("input validation", () => {
    test("throws error when tenantId is missing", () => {
      const { deps } = createMocks();

      expect(() =>
        handleBsaleConnectStart({ tenantId: "", clientCode: "mycompany" }, deps)
      ).toThrow(BsaleConnectionError);
      expect(() =>
        handleBsaleConnectStart({ tenantId: "", clientCode: "mycompany" }, deps)
      ).toThrow("tenantId is required");
    });

    test("throws error when clientCode is missing", () => {
      const { deps } = createMocks();

      expect(() =>
        handleBsaleConnectStart({ tenantId: "tenant-1", clientCode: "" }, deps)
      ).toThrow("client_code is required");
    });

    test("throws error when clientCode is whitespace only", () => {
      const { deps } = createMocks();

      expect(() =>
        handleBsaleConnectStart({ tenantId: "tenant-1", clientCode: "   " }, deps)
      ).toThrow("client_code is required");
    });
  });

  describe("OAuth flow initialization", () => {
    test("stores state with tenantId for connection flow", () => {
      const { deps, stateStore } = createMocks();

      handleBsaleConnectStart({ tenantId: "tenant-1", clientCode: "mycompany" }, deps);

      expect(stateStore.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          codeVerifier: expect.any(String),
          clientCode: "mycompany",
          tenantId: "tenant-1",
        })
      );
    });

    test("generates authorization URL with PKCE", () => {
      const { deps, oauthClient } = createMocks();

      const result = handleBsaleConnectStart(
        { tenantId: "tenant-1", clientCode: "mycompany" },
        deps
      );

      expect(oauthClient.getAuthorizationUrl).toHaveBeenCalledWith(
        "mycompany",
        expect.any(String), // state
        expect.any(String) // code_challenge
      );
      expect(result.authorizationUrl).toContain("https://api.bsale.io/oauth/authorize");
    });

    test("returns authorization URL and state", () => {
      const { deps } = createMocks();

      const result = handleBsaleConnectStart(
        { tenantId: "tenant-1", clientCode: "mycompany" },
        deps
      );

      expect(result).toHaveProperty("authorizationUrl");
      expect(result).toHaveProperty("state");
      expect(result.state).toBeTruthy();
    });
  });

  describe("CSRF protection", () => {
    test("generates unique state for each request", () => {
      const { deps, stateStore } = createMocks();

      handleBsaleConnectStart({ tenantId: "tenant-1", clientCode: "mycompany" }, deps);
      const firstCall = stateStore.set.mock.calls[0] as unknown[];
      const firstState = firstCall?.[0] as string | undefined;

      handleBsaleConnectStart({ tenantId: "tenant-1", clientCode: "mycompany" }, deps);
      const secondCall = stateStore.set.mock.calls[1] as unknown[];
      const secondState = secondCall?.[0] as string | undefined;

      expect(firstState).not.toBe(secondState);
    });
  });
});

describe("handleBsaleConnectCallback", () => {
  describe("input validation", () => {
    test("throws error when code is missing", async () => {
      const { deps } = createMocks();

      try {
        await handleBsaleConnectCallback({ code: "", state: "valid-state" }, deps);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect((error as Error).message).toBe("authorization code is required");
      }
    });

    test("throws error when code is whitespace only", async () => {
      const { deps } = createMocks();

      try {
        await handleBsaleConnectCallback({ code: "   ", state: "valid-state" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("authorization code is required");
      }
    });

    test("throws error when state is missing", async () => {
      const { deps } = createMocks();

      try {
        await handleBsaleConnectCallback({ code: "valid-code", state: "" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("state parameter is required");
      }
    });

    test("throws error when state is whitespace only", async () => {
      const { deps } = createMocks();

      try {
        await handleBsaleConnectCallback({ code: "valid-code", state: "   " }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("state parameter is required");
      }
    });
  });

  describe("state validation (CSRF protection)", () => {
    test("throws error for invalid state", async () => {
      const { deps, stateStore } = createMocks();
      stateStore.consume.mockImplementation(() => null);

      try {
        await handleBsaleConnectCallback({ code: "valid-code", state: "invalid-state" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("invalid or expired state parameter");
      }
    });

    test("throws error for expired state", async () => {
      const { deps, stateStore } = createMocks();
      stateStore.consume.mockImplementation(() => null);

      try {
        await handleBsaleConnectCallback({ code: "valid-code", state: "expired-state" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("invalid or expired state parameter");
      }
    });

    test("throws error when tenantId is missing from state", async () => {
      const { deps, stateStore } = createMocks();
      stateStore.consume.mockImplementation(() => ({
        codeVerifier: "verifier-123",
        clientCode: "mycompany",
        // tenantId is missing
      }));

      try {
        await handleBsaleConnectCallback({ code: "valid-code", state: "valid-state" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("missing tenantId in state");
      }
    });

    test("consumes state (one-time use)", async () => {
      const { deps, stateStore } = createMocks();

      await handleBsaleConnectCallback({ code: "valid-code", state: "valid-state" }, deps);

      expect(stateStore.consume).toHaveBeenCalledWith("valid-state");
    });
  });

  describe("tenant validation", () => {
    test("throws error when tenant not found", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockImplementation(() => Promise.resolve(null));

      try {
        await handleBsaleConnectCallback({ code: "valid-code", state: "valid-state" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("tenant not found");
      }
    });

    test("verifies tenant exists before connecting", async () => {
      const { deps, tenantRepo } = createMocks();

      await handleBsaleConnectCallback({ code: "valid-code", state: "valid-state" }, deps);

      expect(tenantRepo.getById).toHaveBeenCalledWith("tenant-1");
    });
  });

  describe("tenant isolation (cross-tenant attack prevention)", () => {
    test("throws error when Bsale client is already connected to another tenant", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.findByClientCode.mockImplementation(() =>
        Promise.resolve({
          id: "other-tenant",
          bsale_client_code: "mycompany",
          bsale_client_name: "My Company",
          bsale_access_token: "existing-token",
          sync_status: "success",
          created_at: new Date(),
          updated_at: new Date(),
        })
      );

      try {
        await handleBsaleConnectCallback({ code: "valid-code", state: "valid-state" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("Este codigo de cliente ya esta conectado a otra cuenta");
      }
    });

    test("allows reconnecting to same tenant", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.findByClientCode.mockImplementation(() =>
        Promise.resolve({
          id: "tenant-1", // Same tenant
          bsale_client_code: "mycompany",
          bsale_client_name: "My Company",
          bsale_access_token: "existing-token",
          sync_status: "success",
          created_at: new Date(),
          updated_at: new Date(),
        })
      );

      const result = await handleBsaleConnectCallback(
        { code: "valid-code", state: "valid-state" },
        deps
      );

      expect(result.tenantId).toBe("tenant-1");
    });
  });

  describe("token exchange", () => {
    test("exchanges code for token with PKCE verifier", async () => {
      const { deps, oauthClient } = createMocks();

      await handleBsaleConnectCallback({ code: "auth-code", state: "valid-state" }, deps);

      expect(oauthClient.exchangeCodeForToken).toHaveBeenCalledWith(
        "auth-code",
        "verifier-123" // code_verifier from state
      );
    });
  });

  describe("tenant connection", () => {
    test("connects Bsale credentials to tenant", async () => {
      const { deps, tenantRepo } = createMocks();

      await handleBsaleConnectCallback({ code: "valid-code", state: "valid-state" }, deps);

      expect(tenantRepo.connectBsale).toHaveBeenCalledWith("tenant-1", {
        clientCode: "mycompany",
        clientName: "My Company",
        accessToken: "access-token-123",
      });
    });

    test("returns connection result with tenantId and client info", async () => {
      const { deps } = createMocks();

      const result = await handleBsaleConnectCallback(
        { code: "valid-code", state: "valid-state" },
        deps
      );

      expect(result).toEqual({
        tenantId: "tenant-1",
        clientCode: "mycompany",
        clientName: "My Company",
      });
    });
  });
});

describe("handleBsaleDisconnect", () => {
  describe("input validation", () => {
    test("throws error when tenantId is missing", async () => {
      const { deps } = createMocks();

      try {
        await handleBsaleDisconnect("", deps);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(BsaleConnectionError);
        expect((error as Error).message).toBe("tenantId is required");
      }
    });
  });

  describe("tenant validation", () => {
    test("throws error when tenant not found", async () => {
      const { deps, tenantRepo } = createMocks();
      tenantRepo.getById.mockImplementation(() => Promise.resolve(null));

      try {
        await handleBsaleDisconnect("nonexistent-tenant", deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("tenant not found");
      }
    });

    test("verifies tenant exists before disconnecting", async () => {
      const { deps, tenantRepo } = createMocks();

      await handleBsaleDisconnect("tenant-1", deps);

      expect(tenantRepo.getById).toHaveBeenCalledWith("tenant-1");
    });
  });

  describe("disconnection", () => {
    test("disconnects Bsale from tenant", async () => {
      const { deps, tenantRepo } = createMocks();

      await handleBsaleDisconnect("tenant-1", deps);

      expect(tenantRepo.disconnectBsale).toHaveBeenCalledWith("tenant-1");
    });
  });
});

describe("BsaleConnectionError", () => {
  test("is instance of Error", () => {
    const error = new BsaleConnectionError("Test error");
    expect(error).toBeInstanceOf(Error);
  });

  test("has correct name", () => {
    const error = new BsaleConnectionError("Test error");
    expect(error.name).toBe("BsaleConnectionError");
  });

  test("has correct message", () => {
    const error = new BsaleConnectionError("Test error message");
    expect(error.message).toBe("Test error message");
  });
});
