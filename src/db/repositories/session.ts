import type { DatabaseClient } from "@/db/client";
import type { Session } from "./types";

export interface CreateSessionInput {
  userId: string;
  token: string;
  expiresAt: Date;
}

export class SessionRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const results = await this.db.query<{
      id: string;
      user_id: string;
      token: string;
      expires_at: string;
      created_at: string;
    }>(
      `INSERT INTO sessions (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, token, expires_at, created_at`,
      [input.userId, input.token, input.expiresAt.toISOString()]
    );

    const result = results[0];
    if (!result) {
      throw new Error("Failed to create session");
    }

    return {
      id: result.id,
      userId: result.user_id,
      token: result.token,
      expiresAt: new Date(result.expires_at),
      createdAt: new Date(result.created_at),
    };
  }

  async findByToken(token: string): Promise<Session | null> {
    const result = await this.db.queryOne<{
      id: string;
      user_id: string;
      token: string;
      expires_at: string;
      created_at: string;
    }>(
      `SELECT id, user_id, token, expires_at, created_at
       FROM sessions
       WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      userId: result.user_id,
      token: result.token,
      expiresAt: new Date(result.expires_at),
      createdAt: new Date(result.created_at),
    };
  }

  async deleteByToken(token: string): Promise<void> {
    await this.db.execute(`DELETE FROM sessions WHERE token = $1`, [token]);
  }

  async deleteExpired(): Promise<number> {
    const results = await this.db.query<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM sessions WHERE expires_at <= NOW()
         RETURNING id
       )
       SELECT COUNT(*) as count FROM deleted`
    );

    return results[0]?.count ?? 0;
  }

  /**
   * Refresh session expiration (sliding window)
   * Updates the expires_at timestamp to extend the session
   */
  async refreshSession(token: string, newExpiresAt: Date): Promise<void> {
    await this.db.execute(
      `UPDATE sessions SET expires_at = $1 WHERE token = $2`,
      [newExpiresAt.toISOString(), token]
    );
  }
}
