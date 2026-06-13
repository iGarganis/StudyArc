import { createHash } from "node:crypto";

/**
 * Minimal cache interface so the in-memory store can be swapped for a durable
 * one (e.g. Supabase) later without touching callers.
 */
export interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
}

export class InMemoryCache<T> implements Cache<T> {
  private store = new Map<string, T>();

  get(key: string): T | undefined {
    return this.store.get(key);
  }
  set(key: string, value: T): void {
    this.store.set(key, value);
  }
  delete(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

/**
 * Stable cache key for a (document text, mode) pair, optionally salted with
 * extra inputs that change the output (e.g. the cross-mode coverage list).
 */
export function cacheKey(text: string, mode: string, extra = ""): string {
  return createHash("sha256")
    .update(mode)
    .update(":")
    .update(extra)
    .update(":")
    .update(text)
    .digest("hex");
}
