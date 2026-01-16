import type { DatabaseClient } from "@/db/client";
import type { MagicLinkToken } from "./types";

export interface CreateMagicLinkInput {
  email: string;
  token: string;
  expiresAt: Date;
}

export class MagicLinkRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreateMagicLinkInput): Promise<MagicLinkToken> {
    const results = await this.db.query<{
      id: string;
      email: string;
      token: string;
      expires_at: string;
      used_at: string | null;
      created_at: string;
    }>(
      `INSERT INTO magic_link_tokens (email, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, email, token, expires_at, used_at, created_at`,
      [input.email, input.token, input.expiresAt.toISOString()]
    );

    const result = results[0];
    if (!result) {
      throw new Error("Failed to create magic link token");
    }

    return this.mapToMagicLinkToken(result);
  }

  async findValidToken(token: string): Promise<MagicLinkToken | null> {
    const result = await this.db.queryOne<{
      id: string;
      email: string;
      token: string;
      expires_at: string;
      used_at: string | null;
      created_at: string;
    }>(
      `SELECT id, email, token, expires_at, used_at, created_at
       FROM magic_link_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token]
    );

    if (!result) {
      return null;
    }

    return this.mapToMagicLinkToken(result);
  }

  async markUsed(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE magic_link_tokens SET used_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async countRecentByEmail(email: string, windowMinutes: number): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM magic_link_tokens
       WHERE email = $1 AND created_at > NOW() - INTERVAL '1 minute' * $2`,
      [email, windowMinutes]
    );

    return parseInt(result?.count ?? "0", 10);
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db.queryOne<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM magic_link_tokens
         WHERE expires_at <= NOW() OR used_at IS NOT NULL
         RETURNING id
       )
       SELECT COUNT(*) as count FROM deleted`
    );

    return parseInt(result?.count ?? "0", 10);
  }

  /**
   * Find the most recent valid (unused, not expired) token for an email
   * Used by E2E tests to retrieve tokens without checking email
   */
  async findLatestValidTokenByEmail(email: string): Promise<MagicLinkToken | null> {
    const result = await this.db.queryOne<{
      id: string;
      email: string;
      token: string;
      expires_at: string;
      used_at: string | null;
      created_at: string;
    }>(
      `SELECT id, email, token, expires_at, used_at, created_at
       FROM magic_link_tokens
       WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    if (!result) {
      return null;
    }

    return this.mapToMagicLinkToken(result);
  }

  private mapToMagicLinkToken(row: {
    id: string;
    email: string;
    token: string;
    expires_at: string;
    used_at: string | null;
    created_at: string;
  }): MagicLinkToken {
    return {
      id: row.id,
      email: row.email,
      token: row.token,
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at ? new Date(row.used_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
