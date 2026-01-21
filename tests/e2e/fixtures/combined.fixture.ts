/**
 * Combined Fixture for E2E Testing
 *
 * Merges auth, oauth, and database fixtures for comprehensive testing.
 */

import { test as authTest, type AuthFixture, generateTestEmail } from "./auth.fixture";
import { type OAuthFixture, oauthTest } from "./oauth.fixture";
import { type DatabaseFixture, databaseTest } from "./database.fixture";
import { mergeTests, expect } from "@playwright/test";

// Export the merged test fixture
export const test = mergeTests(authTest, oauthTest, databaseTest);

// Re-export types and helpers
export { expect, generateTestEmail };
export type { AuthFixture, OAuthFixture, DatabaseFixture };
