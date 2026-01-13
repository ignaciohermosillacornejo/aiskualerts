import { describe, test, expect } from "bun:test";
import {
  encrypt,
  decrypt,
  isEncrypted,
  createEncryptionService,
} from "@/utils/encryption";

describe("Encryption Utility", () => {
  const validKey = "a".repeat(32); // Minimum 32 characters
  const longerKey = "this-is-a-much-longer-encryption-key-for-testing";

  describe("encrypt", () => {
    test("encrypts plaintext successfully", () => {
      const plaintext = "secret-token-12345";
      const encrypted = encrypt(plaintext, validKey);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(":"); // Format: salt:iv:authTag:ciphertext
      expect(encrypted.split(":")).toHaveLength(4);
    });

    test("produces different ciphertext for same plaintext (due to random salt/IV)", () => {
      const plaintext = "secret-token-12345";
      const encrypted1 = encrypt(plaintext, validKey);
      const encrypted2 = encrypt(plaintext, validKey);

      expect(encrypted1).not.toBe(encrypted2);
    });

    test("encrypts with longer key", () => {
      const plaintext = "secret-token-12345";
      const encrypted = encrypt(plaintext, longerKey);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(":")).toHaveLength(4);
    });

    test("encrypts unicode text", () => {
      const plaintext = "contraseña-秘密-🔐";
      const encrypted = encrypt(plaintext, validKey);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(":")).toHaveLength(4);
    });

    test("encrypts long text", () => {
      const plaintext = "x".repeat(10000);
      const encrypted = encrypt(plaintext, validKey);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(":")).toHaveLength(4);
    });

    test("throws error for empty plaintext", () => {
      expect(() => encrypt("", validKey)).toThrow("Plaintext cannot be empty");
    });

    test("throws error for short encryption key", () => {
      expect(() => encrypt("secret", "short")).toThrow(
        "Encryption key must be at least 32 characters"
      );
    });

    test("throws error for empty encryption key", () => {
      expect(() => encrypt("secret", "")).toThrow(
        "Encryption key must be at least 32 characters"
      );
    });
  });

  describe("decrypt", () => {
    test("decrypts ciphertext successfully", () => {
      const plaintext = "secret-token-12345";
      const encrypted = encrypt(plaintext, validKey);
      const decrypted = decrypt(encrypted, validKey);

      expect(decrypted).toBe(plaintext);
    });

    test("decrypts unicode text correctly", () => {
      const plaintext = "contraseña-秘密-🔐";
      const encrypted = encrypt(plaintext, validKey);
      const decrypted = decrypt(encrypted, validKey);

      expect(decrypted).toBe(plaintext);
    });

    test("decrypts long text correctly", () => {
      const plaintext = "x".repeat(10000);
      const encrypted = encrypt(plaintext, validKey);
      const decrypted = decrypt(encrypted, validKey);

      expect(decrypted).toBe(plaintext);
    });

    test("throws error for wrong key", () => {
      const plaintext = "secret-token-12345";
      const encrypted = encrypt(plaintext, validKey);
      const wrongKey = "b".repeat(32);

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    test("throws error for tampered ciphertext", () => {
      const plaintext = "secret-token-12345";
      const encrypted = encrypt(plaintext, validKey);
      const parts = encrypted.split(":");
      parts[3] = "tamperedciphertext"; // Tamper with ciphertext
      const tampered = parts.join(":");

      expect(() => decrypt(tampered, validKey)).toThrow();
    });

    test("throws error for tampered auth tag", () => {
      const plaintext = "secret-token-12345";
      const encrypted = encrypt(plaintext, validKey);
      const parts = encrypted.split(":");
      parts[2] = "invalidauthtag123"; // Tamper with auth tag
      const tampered = parts.join(":");

      expect(() => decrypt(tampered, validKey)).toThrow();
    });

    test("throws error for invalid format", () => {
      expect(() => decrypt("not:a:valid:format:too:many", validKey)).toThrow(
        "Invalid encrypted text format"
      );
    });

    test("throws error for too few parts", () => {
      expect(() => decrypt("only:two:parts", validKey)).toThrow(
        "Invalid encrypted text format"
      );
    });

    test("throws error for empty encrypted text", () => {
      expect(() => decrypt("", validKey)).toThrow(
        "Encrypted text cannot be empty"
      );
    });

    test("throws error for short decryption key", () => {
      expect(() => decrypt("a:b:c:d", "short")).toThrow(
        "Encryption key must be at least 32 characters"
      );
    });

    test("throws error for invalid salt length", () => {
      // Create encrypted text with wrong salt length
      const parts = [
        "short", // Too short salt
        Buffer.from("123456789012").toString("base64"), // 12 bytes IV
        Buffer.from("1234567890123456").toString("base64"), // 16 bytes auth tag
        "ciphertext",
      ];
      expect(() => decrypt(parts.join(":"), validKey)).toThrow("Invalid salt length");
    });

    test("throws error for invalid IV length", () => {
      const parts = [
        Buffer.from("1234567890123456").toString("base64"), // 16 bytes salt
        "short", // Too short IV
        Buffer.from("1234567890123456").toString("base64"), // 16 bytes auth tag
        "ciphertext",
      ];
      expect(() => decrypt(parts.join(":"), validKey)).toThrow("Invalid IV length");
    });

    test("throws error for invalid auth tag length", () => {
      const parts = [
        Buffer.from("1234567890123456").toString("base64"), // 16 bytes salt
        Buffer.from("123456789012").toString("base64"), // 12 bytes IV
        "short", // Too short auth tag
        "ciphertext",
      ];
      expect(() => decrypt(parts.join(":"), validKey)).toThrow("Invalid auth tag length");
    });

    test("throws error for missing components", () => {
      expect(() => decrypt(":::", validKey)).toThrow("Invalid encrypted text format: missing components");
    });
  });

  describe("isEncrypted", () => {
    test("returns true for encrypted text", () => {
      const plaintext = "secret-token-12345";
      const encrypted = encrypt(plaintext, validKey);

      expect(isEncrypted(encrypted)).toBe(true);
    });

    test("returns false for plaintext", () => {
      expect(isEncrypted("secret-token-12345")).toBe(false);
    });

    test("returns false for empty string", () => {
      expect(isEncrypted("")).toBe(false);
    });

    test("returns false for wrong number of parts", () => {
      expect(isEncrypted("a:b:c")).toBe(false);
      expect(isEncrypted("a:b:c:d:e")).toBe(false);
    });

    test("returns false for invalid base64", () => {
      expect(isEncrypted("not-base64:::::")).toBe(false);
    });

    test("returns false for wrong component lengths", () => {
      const parts = [
        "short", // Wrong salt length
        Buffer.from("123456789012").toString("base64"),
        Buffer.from("1234567890123456").toString("base64"),
        "ciphertext",
      ];
      expect(isEncrypted(parts.join(":"))).toBe(false);
    });

    test("returns false for missing parts", () => {
      expect(isEncrypted("a:::d")).toBe(false);
    });
  });

  describe("createEncryptionService", () => {
    test("creates service with bound key", () => {
      const service = createEncryptionService({ encryptionKey: validKey });
      const plaintext = "secret-token-12345";

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test("service.isEncrypted works correctly", () => {
      const service = createEncryptionService({ encryptionKey: validKey });
      const encrypted = service.encrypt("test");

      expect(service.isEncrypted(encrypted)).toBe(true);
      expect(service.isEncrypted("not-encrypted")).toBe(false);
    });

    test("multiple services with same key produce compatible results", () => {
      const service1 = createEncryptionService({ encryptionKey: validKey });
      const service2 = createEncryptionService({ encryptionKey: validKey });
      const plaintext = "secret-token-12345";

      const encrypted = service1.encrypt(plaintext);
      const decrypted = service2.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test("services with different keys are incompatible", () => {
      const service1 = createEncryptionService({ encryptionKey: validKey });
      const service2 = createEncryptionService({ encryptionKey: "b".repeat(32) });
      const plaintext = "secret-token-12345";

      const encrypted = service1.encrypt(plaintext);

      expect(() => service2.decrypt(encrypted)).toThrow();
    });
  });
});
