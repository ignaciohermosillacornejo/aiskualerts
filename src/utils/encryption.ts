import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

export interface EncryptionConfig {
  encryptionKey: string;
}

/**
 * Derives a key from the encryption key using scrypt
 * @param encryptionKey - The base encryption key (from environment)
 * @param salt - Salt for key derivation
 * @returns Derived 256-bit key
 */
function deriveKey(encryptionKey: string, salt: Buffer): Buffer {
  return scryptSync(encryptionKey, salt, KEY_LENGTH);
}

/**
 * Encrypts plaintext using AES-256-GCM
 * Format: salt:iv:authTag:ciphertext (all base64 encoded, concatenated with colons)
 *
 * @param plaintext - The text to encrypt
 * @param encryptionKey - The encryption key from config
 * @returns Encrypted string in format salt:iv:authTag:ciphertext
 * @throws Error if encryption fails
 */
export function encrypt(plaintext: string, encryptionKey: string): string {
  if (!plaintext) {
    throw new Error("Plaintext cannot be empty");
  }
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("Encryption key must be at least 32 characters");
  }

  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(encryptionKey, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:ciphertext
  return [
    salt.toString("base64"),
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypts ciphertext using AES-256-GCM
 *
 * @param encryptedText - Encrypted string in format salt:iv:authTag:ciphertext
 * @param encryptionKey - The encryption key from config
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or data is tampered with
 */
export function decrypt(encryptedText: string, encryptionKey: string): string {
  if (!encryptedText) {
    throw new Error("Encrypted text cannot be empty");
  }
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("Encryption key must be at least 32 characters");
  }

  const parts = encryptedText.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted text format");
  }

  const [saltB64, ivB64, authTagB64, ciphertextB64] = parts;

  if (!saltB64 || !ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted text format: missing components");
  }

  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  // Validate component sizes
  if (salt.length !== SALT_LENGTH) {
    throw new Error("Invalid salt length");
  }
  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const key = deriveKey(encryptionKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    // Re-throw with a more descriptive message for auth failures
    if (error instanceof Error && error.message.includes("Unsupported state")) {
      throw new Error("Decryption failed: data may be corrupted or tampered with");
    }
    throw error;
  }
}

/**
 * Checks if a string appears to be encrypted (matches our format)
 * @param text - Text to check
 * @returns true if the text appears to be encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;

  const parts = text.split(":");
  if (parts.length !== 4) return false;

  const [saltB64, ivB64, authTagB64, ciphertextB64] = parts;

  if (!saltB64 || !ivB64 || !authTagB64 || !ciphertextB64) return false;

  try {
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    // Just check that ciphertext is valid base64
    Buffer.from(ciphertextB64, "base64");

    return salt.length === SALT_LENGTH &&
           iv.length === IV_LENGTH &&
           authTag.length === AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Creates an encryption service with a bound key
 * This is useful for dependency injection
 */
export function createEncryptionService(config: EncryptionConfig) {
  return {
    encrypt: (plaintext: string) => encrypt(plaintext, config.encryptionKey),
    decrypt: (encryptedText: string) => decrypt(encryptedText, config.encryptionKey),
    isEncrypted,
  };
}

export type EncryptionService = ReturnType<typeof createEncryptionService>;
