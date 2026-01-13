/**
 * One-time migration script to encrypt existing access tokens
 *
 * Usage:
 *   TOKEN_ENCRYPTION_KEY=<your-32-char-key> bun run scripts/migrate-encrypt-tokens.ts
 *
 * Options:
 *   --dry-run     Show what would be encrypted without making changes
 *   --verbose     Show detailed progress
 *
 * Prerequisites:
 *   1. Set TOKEN_ENCRYPTION_KEY environment variable (at least 32 characters)
 *   2. Database connection configured via standard env vars
 */

import { encrypt, isEncrypted } from "../src/utils/encryption";
import { getDb, closeDb } from "../src/db/client";

interface TenantRow {
  id: string;
  bsale_access_token: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");

  console.log("=".repeat(60));
  console.log("Token Encryption Migration Script");
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("\n[DRY RUN MODE] No changes will be made\n");
  }

  // Validate encryption key
  const encryptionKey = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!encryptionKey || encryptionKey.length < 32) {
    console.error("ERROR: TOKEN_ENCRYPTION_KEY must be set and at least 32 characters");
    console.error("Example: TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32) bun run scripts/migrate-encrypt-tokens.ts");
    process.exit(1);
  }

  // Connect to database using the shared client
  console.log("Connecting to database...");
  const db = getDb();

  try {
    // Fetch all tenants with access tokens
    console.log("Fetching tenants with access tokens...\n");
    const tenants = await db.query<TenantRow>(
      `SELECT id, bsale_access_token
       FROM tenants
       WHERE bsale_access_token IS NOT NULL`
    );

    console.log(`Found ${String(tenants.length)} tenant(s) with access tokens\n`);

    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;
    let errorCount = 0;

    for (const tenant of tenants) {
      const tenantId = tenant.id;
      const token = tenant.bsale_access_token;

      if (verbose) {
        console.log(`Processing tenant ${tenantId}...`);
      }

      // Check if already encrypted
      if (isEncrypted(token)) {
        alreadyEncryptedCount++;
        if (verbose) {
          console.log(`  - Already encrypted, skipping`);
        }
        continue;
      }

      try {
        // Encrypt the token
        const encryptedToken = encrypt(token, encryptionKey);

        if (dryRun) {
          console.log(`Would encrypt token for tenant ${tenantId}`);
          if (verbose) {
            console.log(`  - Original length: ${String(token.length)}`);
            console.log(`  - Encrypted length: ${String(encryptedToken.length)}`);
          }
        } else {
          // Update the database
          await db.execute(
            `UPDATE tenants
             SET bsale_access_token = $1, updated_at = NOW()
             WHERE id = $2`,
            [encryptedToken, tenantId]
          );

          if (verbose) {
            console.log(`  - Encrypted successfully`);
          }
        }

        encryptedCount++;
      } catch (error) {
        errorCount++;
        console.error(`ERROR encrypting token for tenant ${tenantId}:`, error);
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("Migration Summary");
    console.log("=".repeat(60));
    console.log(`Total tenants processed: ${String(tenants.length)}`);
    console.log(`Tokens encrypted: ${String(encryptedCount)}`);
    console.log(`Already encrypted (skipped): ${String(alreadyEncryptedCount)}`);
    console.log(`Errors: ${String(errorCount)}`);

    if (dryRun) {
      console.log("\n[DRY RUN] No changes were made");
    }

    if (errorCount > 0) {
      process.exit(1);
    }

    console.log("\nMigration completed successfully!");
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
