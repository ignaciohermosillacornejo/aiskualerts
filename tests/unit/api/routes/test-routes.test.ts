import { test, expect, describe, mock, beforeEach } from "bun:test";
import { createTestRoutes } from "@/api/routes/test";
import type { MagicLinkToken } from "@/db/repositories/types";

// Type for mock return value
type MockTokenResult = MagicLinkToken | null;

describe("Test Routes", () => {
  // Mock magic link repository with proper typing
  const mockFindLatestValidTokenByEmail = mock<(email: string) => Promise<MockTokenResult>>(
    () => Promise.resolve(null)
  );

  const mockMagicLinkRepo = {
    findLatestValidTokenByEmail: mockFindLatestValidTokenByEmail,
  };

  const testRoutes = createTestRoutes({
    magicLinkRepo: mockMagicLinkRepo as never,
  });

  beforeEach(() => {
    mockFindLatestValidTokenByEmail.mockReset();
    mockFindLatestValidTokenByEmail.mockResolvedValue(null);
  });

  describe("GET /api/test/magic-link-token", () => {
    test("returns 400 when email parameter is missing", async () => {
      const request = new Request("http://localhost/api/test/magic-link-token");
      const response = await testRoutes.getMagicLinkToken(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Email parameter is required");
    });

    test("returns 404 when no valid token found", async () => {
      mockFindLatestValidTokenByEmail.mockResolvedValue(null);

      const request = new Request(
        "http://localhost/api/test/magic-link-token?email=test@example.com"
      );
      const response = await testRoutes.getMagicLinkToken(request);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain("No valid token found");
    });

    test("returns token when valid token found", async () => {
      const mockToken: MagicLinkToken = {
        id: "token-1",
        email: "test@example.com",
        token: "valid-token-abc123",
        expiresAt: new Date(Date.now() + 900000),
        usedAt: null,
        createdAt: new Date(),
      };
      mockFindLatestValidTokenByEmail.mockResolvedValue(mockToken);

      const request = new Request(
        "http://localhost/api/test/magic-link-token?email=test@example.com"
      );
      const response = await testRoutes.getMagicLinkToken(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.token).toBe("valid-token-abc123");
    });

    test("calls repository with correct email", async () => {
      mockFindLatestValidTokenByEmail.mockResolvedValue(null);

      const request = new Request(
        "http://localhost/api/test/magic-link-token?email=User@Example.com"
      );
      await testRoutes.getMagicLinkToken(request);

      expect(mockFindLatestValidTokenByEmail).toHaveBeenCalledWith(
        "User@Example.com"
      );
    });
  });

  describe("Production Safety", () => {
    test("createTestRoutes throws in production", () => {
      // eslint-disable-next-line @typescript-eslint/dot-notation -- TypeScript exactOptionalPropertyTypes requires bracket notation
      const originalEnv = process.env["NODE_ENV"] ?? "test";
      // eslint-disable-next-line @typescript-eslint/dot-notation -- TypeScript exactOptionalPropertyTypes requires bracket notation
      process.env["NODE_ENV"] = "production";

      expect(() => {
        createTestRoutes({ magicLinkRepo: mockMagicLinkRepo as never });
      }).toThrow("Test routes cannot be created in production environment");

      // eslint-disable-next-line @typescript-eslint/dot-notation -- TypeScript exactOptionalPropertyTypes requires bracket notation
      process.env["NODE_ENV"] = originalEnv;
    });
  });
});
