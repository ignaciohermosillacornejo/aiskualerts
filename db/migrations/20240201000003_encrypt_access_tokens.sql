-- migrate:up
-- Migration 003: Token encryption placeholder
-- Note: Token encryption is handled by the application layer, not database changes.
-- The bsale_access_token column remains TEXT but stores encrypted values
-- in format: salt:iv:authTag:ciphertext
-- Run scripts/migrate-encrypt-tokens.ts after deploying new code.

SELECT 1;

-- migrate:down
SELECT 1;
