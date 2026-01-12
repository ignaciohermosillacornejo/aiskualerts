import { test, expect, describe, beforeEach } from "bun:test";
import { OAuthStateStore } from "@/utils/oauth-state-store";

describe("OAuthStateStore", () => {
  let store: OAuthStateStore;

  beforeEach(() => {
    store = new OAuthStateStore(1); // 1 minute TTL for testing
  });

  describe("set and consume", () => {
    test("stores and retrieves state data", () => {
      const state = "test-state-123";
      const data = { codeVerifier: "verifier-abc", clientCode: "client-xyz" };

      store.set(state, data);
      const result = store.consume(state);

      expect(result).not.toBeNull();
      expect(result?.codeVerifier).toBe("verifier-abc");
      expect(result?.clientCode).toBe("client-xyz");
      expect(result?.createdAt).toBeGreaterThan(0);
    });

    test("consumes state only once (one-time use)", () => {
      const state = "test-state-123";
      store.set(state, { codeVerifier: "verifier", clientCode: "client" });

      const first = store.consume(state);
      const second = store.consume(state);

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    test("returns null for non-existent state", () => {
      const result = store.consume("non-existent");
      expect(result).toBeNull();
    });

    test("overwrites existing state with same key", () => {
      const state = "test-state";
      store.set(state, { codeVerifier: "old", clientCode: "old" });
      store.set(state, { codeVerifier: "new", clientCode: "new" });

      const result = store.consume(state);

      expect(result?.codeVerifier).toBe("new");
      expect(result?.clientCode).toBe("new");
    });
  });

  describe("TTL expiration", () => {
    test("returns null for expired state", async () => {
      // Create store with very short TTL (1ms converted from minutes)
      const shortTtlStore = new OAuthStateStore(0.00001); // ~0.6ms

      shortTtlStore.set("state", { codeVerifier: "v", clientCode: "c" });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = shortTtlStore.consume("state");
      expect(result).toBeNull();
    });
  });

  describe("size", () => {
    test("returns correct store size", () => {
      expect(store.size()).toBe(0);

      store.set("state1", { codeVerifier: "v1", clientCode: "c1" });
      expect(store.size()).toBe(1);

      store.set("state2", { codeVerifier: "v2", clientCode: "c2" });
      expect(store.size()).toBe(2);

      store.consume("state1");
      expect(store.size()).toBe(1);
    });
  });

  describe("cleanup", () => {
    test("cleans up expired entries on set", async () => {
      const shortTtlStore = new OAuthStateStore(0.00001);

      shortTtlStore.set("old", { codeVerifier: "v", clientCode: "c" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Setting a new entry should trigger cleanup
      shortTtlStore.set("new", { codeVerifier: "v", clientCode: "c" });

      // Old entry should be cleaned up
      expect(shortTtlStore.size()).toBeLessThanOrEqual(1);
    });
  });
});
