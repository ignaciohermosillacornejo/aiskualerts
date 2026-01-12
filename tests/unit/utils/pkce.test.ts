import { test, expect, describe } from "bun:test";
import { generatePKCE, generateState } from "@/utils/pkce";
import { createHash } from "node:crypto";

describe("PKCE utilities", () => {
  describe("generatePKCE", () => {
    test("generates valid code verifier and challenge", () => {
      const { codeVerifier, codeChallenge } = generatePKCE();

      // Code verifier should be base64url encoded (43-128 chars)
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeVerifier.length).toBeLessThanOrEqual(128);
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);

      // Code challenge should be base64url encoded SHA256 hash
      expect(codeChallenge.length).toBeGreaterThan(0);
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("code challenge is S256 hash of code verifier", () => {
      const { codeVerifier, codeChallenge } = generatePKCE();

      // Verify the challenge is correctly derived from verifier
      const expectedChallenge = createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      expect(codeChallenge).toBe(expectedChallenge);
    });

    test("generates unique values each time", () => {
      const pkce1 = generatePKCE();
      const pkce2 = generatePKCE();

      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });
  });

  describe("generateState", () => {
    test("generates a 64-character hex string", () => {
      const state = generateState();

      expect(state.length).toBe(64);
      expect(state).toMatch(/^[0-9a-f]+$/);
    });

    test("generates unique values each time", () => {
      const state1 = generateState();
      const state2 = generateState();

      expect(state1).not.toBe(state2);
    });
  });
});
