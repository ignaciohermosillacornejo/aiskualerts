-- Migration: 003_encrypt_access_tokens
-- Description: Placeholder for token encryption migration
-- Note: This migration is empty because token encryption is handled
--       by the application layer, not database changes.
--       The actual data migration is done via scripts/migrate-encrypt-tokens.ts
--
-- The bsale_access_token column remains TEXT but will now store
-- encrypted values in format: salt:iv:authTag:ciphertext
--
-- Run the migration script AFTER deploying the new code:
-- bun run scripts/migrate-encrypt-tokens.ts
--
-- IMPORTANT: Ensure TOKEN_ENCRYPTION_KEY environment variable is set
-- before running the migration script.

-- No schema changes needed - tokens are encrypted at application layer
SELECT 1;
