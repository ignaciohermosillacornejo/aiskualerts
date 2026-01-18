import { test, expect, describe, mock } from "bun:test";
import {
  handleMagicLinkRequest,
  handleMagicLinkVerify,
  MagicLinkError,
  type MagicLinkHandlerDeps,
} from "@/api/handlers/magic-link";

// Type for magic link token data
type MagicLinkTokenData = {
  id: string;
  email: string;
  token: string;
  expiresAt: Date;
  usedAt: null;
  createdAt: Date;
} | null;

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

// Type for user data
type UserData = {
  id: string;
  tenant_id: string;
  email: string;
  name: string | null;
  notification_enabled: boolean;
  created_at: Date;
} | null;

// Mock dependencies factory
function createMocks() {
  const magicLinkRepo = {
    countRecentByEmail: mock(() => Promise.resolve(0)),
    create: mock(() => Promise.resolve({ id: "token-1" })),
    findValidToken: mock((): Promise<MagicLinkTokenData> =>
      Promise.resolve({
        id: "token-1",
        email: "test@example.com",
        token: "valid-token-123",
        expiresAt: new Date(Date.now() + 900000), // 15 min from now
        usedAt: null,
        createdAt: new Date(),
      })
    ),
    markUsed: mock(() => Promise.resolve()),
  };

  const tenantRepo = {
    findByUserEmail: mock((): Promise<TenantData> => Promise.resolve(null)),
    createForMagicLink: mock(() =>
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
  };

  const userRepo = {
    getByEmail: mock((): Promise<UserData> => Promise.resolve(null)),
    create: mock(() =>
      Promise.resolve({
        id: "user-1",
        tenant_id: "tenant-1",
        email: "test@example.com",
        name: null,
        notification_enabled: true,
        created_at: new Date(),
      })
    ),
  };

  const sessionRepo = {
    create: mock(() => Promise.resolve()),
  };

  const emailClient = {
    sendEmail: mock(() => Promise.resolve({ success: true })),
  };

  const config = {
    appUrl: "https://app.example.com",
    magicLinkExpiryMinutes: 15,
    magicLinkRateLimitPerHour: 5,
  };

  const deps: MagicLinkHandlerDeps = {
    magicLinkRepo,
    tenantRepo,
    userRepo,
    sessionRepo,
    emailClient,
    config,
  } as unknown as MagicLinkHandlerDeps;

  return { deps, magicLinkRepo, tenantRepo, userRepo, sessionRepo, emailClient, config };
}

describe("handleMagicLinkRequest", () => {
  describe("email validation", () => {
    test("accepts valid email format", async () => {
      const { deps, magicLinkRepo, emailClient } = createMocks();

      const result = await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      expect(result.success).toBe(true);
      expect(magicLinkRepo.create).toHaveBeenCalled();
      expect(emailClient.sendEmail).toHaveBeenCalled();
    });

    test("rejects invalid email format silently (email enumeration prevention)", async () => {
      const { deps, magicLinkRepo, emailClient } = createMocks();

      const result = await handleMagicLinkRequest({ email: "invalid-email" }, deps);

      // Should return success to prevent enumeration
      expect(result.success).toBe(true);
      expect(result.message).toBe("Si el correo existe en nuestro sistema, recibiras un enlace de acceso.");
      // But should not create token or send email
      expect(magicLinkRepo.create).not.toHaveBeenCalled();
      expect(emailClient.sendEmail).not.toHaveBeenCalled();
    });

    test("normalizes email to lowercase", async () => {
      const { deps, magicLinkRepo } = createMocks();

      await handleMagicLinkRequest({ email: "TEST@EXAMPLE.COM" }, deps);

      expect(magicLinkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: "test@example.com" })
      );
    });

    test("trims whitespace from email", async () => {
      const { deps, magicLinkRepo } = createMocks();

      await handleMagicLinkRequest({ email: "  test@example.com  " }, deps);

      expect(magicLinkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: "test@example.com" })
      );
    });
  });

  describe("rate limiting", () => {
    test("allows requests under rate limit", async () => {
      const { deps, magicLinkRepo, emailClient } = createMocks();
      magicLinkRepo.countRecentByEmail.mockImplementation(() => Promise.resolve(4));

      const result = await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      expect(result.success).toBe(true);
      expect(magicLinkRepo.create).toHaveBeenCalled();
      expect(emailClient.sendEmail).toHaveBeenCalled();
    });

    test("blocks requests at rate limit (silently)", async () => {
      const { deps, magicLinkRepo, emailClient } = createMocks();
      magicLinkRepo.countRecentByEmail.mockImplementation(() => Promise.resolve(5));

      const result = await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      // Should return success to prevent revealing rate limit
      expect(result.success).toBe(true);
      // But should not create token or send email
      expect(magicLinkRepo.create).not.toHaveBeenCalled();
      expect(emailClient.sendEmail).not.toHaveBeenCalled();
    });

    test("blocks requests over rate limit (silently)", async () => {
      const { deps, magicLinkRepo, emailClient } = createMocks();
      magicLinkRepo.countRecentByEmail.mockImplementation(() => Promise.resolve(10));

      const result = await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      expect(result.success).toBe(true);
      expect(magicLinkRepo.create).not.toHaveBeenCalled();
      expect(emailClient.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("token generation and storage", () => {
    test("creates token with correct expiry time", async () => {
      const { deps, magicLinkRepo } = createMocks();

      await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      expect(magicLinkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          token: expect.any(String),
          expiresAt: expect.any(Date),
        })
      );

      // Verify expiry is approximately 15 minutes from now
      const createCall = magicLinkRepo.create.mock.calls[0] as unknown[];
      const args = createCall?.[0] as { expiresAt: Date } | undefined;
      if (args?.expiresAt) {
        const expectedExpiry = Date.now() + 15 * 60 * 1000;
        expect(args.expiresAt.getTime()).toBeGreaterThan(expectedExpiry - 5000);
        expect(args.expiresAt.getTime()).toBeLessThan(expectedExpiry + 5000);
      }
    });

    test("generates unique 64-character hex token", async () => {
      const { deps, magicLinkRepo } = createMocks();

      await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      const createCall = magicLinkRepo.create.mock.calls[0] as unknown[];
      const args = createCall?.[0] as { token: string } | undefined;
      if (args?.token) {
        expect(args.token).toHaveLength(64); // 32 bytes = 64 hex chars
        expect(args.token).toMatch(/^[a-f0-9]+$/);
      }
    });
  });

  describe("email sending", () => {
    test("sends email with correct parameters", async () => {
      const { deps, emailClient } = createMocks();

      await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      expect(emailClient.sendEmail).toHaveBeenCalled();
      const sendEmailCall = emailClient.sendEmail.mock.calls[0] as unknown[];
      const emailParams = sendEmailCall?.[0] as { to: string; subject: string; html: string } | undefined;
      if (emailParams) {
        expect(emailParams.to).toBe("test@example.com");
        expect(emailParams.subject).toBe("Inicia sesion en AISku Alerts");
        expect(emailParams.html).toContain("AISku Alerts");
        expect(emailParams.html).toContain("magic-link/verify");
      }
    });

    test("returns success even if email fails (enumeration prevention)", async () => {
      const { deps, emailClient } = createMocks();
      emailClient.sendEmail.mockImplementation(() => Promise.resolve({ success: false }));

      const result = await handleMagicLinkRequest({ email: "test@example.com" }, deps);

      expect(result.success).toBe(true);
    });
  });

  describe("email enumeration prevention", () => {
    test("returns same response for valid email", async () => {
      const { deps } = createMocks();
      const result = await handleMagicLinkRequest({ email: "exists@example.com" }, deps);
      expect(result.message).toBe("Si el correo existe en nuestro sistema, recibiras un enlace de acceso.");
    });

    test("returns same response for invalid email format", async () => {
      const { deps } = createMocks();
      const result = await handleMagicLinkRequest({ email: "not-an-email" }, deps);
      expect(result.message).toBe("Si el correo existe en nuestro sistema, recibiras un enlace de acceso.");
    });

    test("returns same response when rate limited", async () => {
      const { deps, magicLinkRepo } = createMocks();
      magicLinkRepo.countRecentByEmail.mockImplementation(() => Promise.resolve(10));
      const result = await handleMagicLinkRequest({ email: "test@example.com" }, deps);
      expect(result.message).toBe("Si el correo existe en nuestro sistema, recibiras un enlace de acceso.");
    });
  });
});

describe("handleMagicLinkVerify", () => {
  describe("token validation", () => {
    test("throws error for empty token", async () => {
      const { deps } = createMocks();

      try {
        await handleMagicLinkVerify({ token: "" }, deps);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(MagicLinkError);
        expect((error as Error).message).toBe("Token is required");
      }
    });

    test("throws error for whitespace-only token", async () => {
      const { deps } = createMocks();

      try {
        await handleMagicLinkVerify({ token: "   " }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("Token is required");
      }
    });

    test("throws error for invalid token", async () => {
      const { deps, magicLinkRepo } = createMocks();
      magicLinkRepo.findValidToken.mockImplementation(() => Promise.resolve(null));

      try {
        await handleMagicLinkVerify({ token: "invalid-token" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("Invalid or expired token");
      }
    });

    test("throws error for expired token", async () => {
      const { deps, magicLinkRepo } = createMocks();
      magicLinkRepo.findValidToken.mockImplementation(() => Promise.resolve(null)); // Expired tokens return null

      try {
        await handleMagicLinkVerify({ token: "expired-token" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("Invalid or expired token");
      }
    });
  });

  describe("token usage", () => {
    test("marks token as used after validation", async () => {
      const { deps, magicLinkRepo } = createMocks();

      await handleMagicLinkVerify({ token: "valid-token" }, deps);

      expect(magicLinkRepo.markUsed).toHaveBeenCalledWith("token-1");
    });

    test("prevents token reuse (one-time use)", async () => {
      const { deps, magicLinkRepo } = createMocks();
      // First call succeeds
      await handleMagicLinkVerify({ token: "valid-token" }, deps);

      // Second call fails (token already used)
      magicLinkRepo.findValidToken.mockImplementation(() => Promise.resolve(null));
      try {
        await handleMagicLinkVerify({ token: "valid-token" }, deps);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBe("Invalid or expired token");
      }
    });
  });

  describe("user and tenant creation", () => {
    test("creates new tenant for new email", async () => {
      const { deps, tenantRepo, userRepo } = createMocks();
      tenantRepo.findByUserEmail.mockImplementation(() => Promise.resolve(null));

      await handleMagicLinkVerify({ token: "valid-token" }, deps);

      expect(tenantRepo.createForMagicLink).toHaveBeenCalledWith("test@example.com");
      expect(userRepo.create).toHaveBeenCalled();
    });

    test("creates new user for existing tenant without user", async () => {
      const { deps, tenantRepo, userRepo } = createMocks();
      tenantRepo.findByUserEmail.mockImplementation(() =>
        Promise.resolve({
          id: "existing-tenant",
          bsale_client_code: null,
          bsale_client_name: null,
          bsale_access_token: null,
          sync_status: "not_connected",
          created_at: new Date(),
          updated_at: new Date(),
        })
      );
      userRepo.getByEmail.mockImplementation(() => Promise.resolve(null));

      await handleMagicLinkVerify({ token: "valid-token" }, deps);

      expect(tenantRepo.createForMagicLink).not.toHaveBeenCalled();
      expect(userRepo.create).toHaveBeenCalled();
    });

    test("reuses existing tenant and user", async () => {
      const { deps, tenantRepo, userRepo } = createMocks();
      tenantRepo.findByUserEmail.mockImplementation(() =>
        Promise.resolve({
          id: "existing-tenant",
          bsale_client_code: null,
          bsale_client_name: null,
          bsale_access_token: null,
          sync_status: "not_connected",
          created_at: new Date(),
          updated_at: new Date(),
        })
      );
      userRepo.getByEmail.mockImplementation(() =>
        Promise.resolve({
          id: "existing-user",
          tenant_id: "existing-tenant",
          email: "test@example.com",
          name: null,
          notification_enabled: true,
          created_at: new Date(),
        })
      );

      const result = await handleMagicLinkVerify({ token: "valid-token" }, deps);

      expect(tenantRepo.createForMagicLink).not.toHaveBeenCalled();
      expect(userRepo.create).not.toHaveBeenCalled();
      expect(result.userId).toBe("existing-user");
      expect(result.tenantId).toBe("existing-tenant");
    });
  });

  describe("session creation", () => {
    test("creates session with 7-day expiry (sliding window will extend)", async () => {
      const { deps, sessionRepo } = createMocks();

      await handleMagicLinkVerify({ token: "valid-token" }, deps);

      expect(sessionRepo.create).toHaveBeenCalledWith({
        userId: expect.any(String),
        token: expect.any(String),
        expiresAt: expect.any(Date),
      });

      // Verify expiry is approximately 7 days from now (sliding window will extend)
      const createCall = sessionRepo.create.mock.calls[0] as unknown[];
      const args = createCall?.[0] as { expiresAt: Date } | undefined;
      if (args?.expiresAt) {
        const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
        expect(args.expiresAt.getTime()).toBeGreaterThan(expectedExpiry - 60000);
        expect(args.expiresAt.getTime()).toBeLessThan(expectedExpiry + 60000);
      }
    });

    test("returns session data with token, userId, and tenantId", async () => {
      const { deps } = createMocks();

      const result = await handleMagicLinkVerify({ token: "valid-token" }, deps);

      expect(result).toHaveProperty("sessionToken");
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("tenantId");
      expect(result.sessionToken).toHaveLength(64); // 32 bytes = 64 hex chars
    });
  });
});

describe("MagicLinkError", () => {
  test("is instance of Error", () => {
    const error = new MagicLinkError("Test error");
    expect(error).toBeInstanceOf(Error);
  });

  test("has correct name", () => {
    const error = new MagicLinkError("Test error");
    expect(error.name).toBe("MagicLinkError");
  });

  test("has correct message", () => {
    const error = new MagicLinkError("Test error message");
    expect(error.message).toBe("Test error message");
  });
});
