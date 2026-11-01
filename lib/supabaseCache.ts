import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RemoteCache } from "./cache.ts";
import type { GeneratedMaterial } from "./ai/types.ts";

const TABLE = "material_cache";

/**
 * A slow or paused database must only ever cost a moment, because Gemini can
 * still answer. Free Supabase projects pause after a period of inactivity.
 */
const DEFAULT_TIMEOUT_MS = 2500;

/**
 * Durable cache of generated material, surviving server restarts. Every failure
 * is treated as a cache miss: the app must work the same with the database down.
 */
export class SupabaseCache implements RemoteCache<GeneratedMaterial> {
  private client: SupabaseClient;
  private timeoutMs: number;

  constructor(client: SupabaseClient, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.client = client;
    this.timeoutMs = timeoutMs;
  }

  async get(key: string): Promise<GeneratedMaterial | undefined> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select("material")
        .eq("cache_key", key)
        .abortSignal(AbortSignal.timeout(this.timeoutMs))
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.material as GeneratedMaterial | undefined) ?? undefined;
    } catch (err) {
      logFailure("read", err);
      return undefined;
    }
  }

  async set(key: string, value: GeneratedMaterial): Promise<void> {
    try {
      const { error } = await this.client
        .from(TABLE)
        .upsert({ cache_key: key, mode: value.mode, material: value })
        .abortSignal(AbortSignal.timeout(this.timeoutMs));
      if (error) throw new Error(error.message);
    } catch (err) {
      logFailure("write", err);
    }
  }
}

function logFailure(action: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[cache] database ${action} failed, continuing without it: ${message}`);
}

/** The configured database cache, or null when Supabase isn't set up. */
export function createSupabaseCache(
  url = process.env.SUPABASE_URL?.trim(),
  secretKey = process.env.SUPABASE_SECRET_KEY?.trim(),
): SupabaseCache | null {
  if (!url || !secretKey) return null;
  try {
    const client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return new SupabaseCache(client);
  } catch (err) {
    // This runs when the route loads, so a malformed URL would otherwise fail
    // every request, even though Gemini could still answer them.
    logFailure("setup", err);
    return null;
  }
}
