export interface OAuthStateData {
  codeVerifier: string;
  clientCode: string;
  createdAt: number;
  tenantId?: string; // For Bsale connection flow (existing tenant)
}

/**
 * In-memory store for OAuth state parameters
 * Stores state -> {codeVerifier, clientCode} mapping with TTL
 */
export class OAuthStateStore {
  private store = new Map<string, OAuthStateData>();
  private ttlMs: number;

  constructor(ttlMinutes = 10) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  /**
   * Store OAuth state data
   */
  set(state: string, data: Omit<OAuthStateData, "createdAt">): void {
    this.cleanup();
    this.store.set(state, {
      ...data,
      createdAt: Date.now(),
    });
  }

  /**
   * Retrieve and delete OAuth state data (one-time use)
   */
  consume(state: string): OAuthStateData | null {
    this.cleanup();
    const data = this.store.get(state);
    if (!data) {
      return null;
    }

    // Check if expired
    if (Date.now() - data.createdAt > this.ttlMs) {
      this.store.delete(state);
      return null;
    }

    // Delete after consuming (one-time use)
    this.store.delete(state);
    return data;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (now - value.createdAt > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get current store size (for testing)
   */
  size(): number {
    return this.store.size;
  }
}

// Singleton instance
export const oauthStateStore = new OAuthStateStore();
