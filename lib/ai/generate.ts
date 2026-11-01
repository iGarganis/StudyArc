import { getProvider } from "./provider.ts";
import type {
  AIProvider,
  GenerateParams,
  GeneratedMaterial,
  GenerationResult,
} from "./types.ts";
import { InMemoryCache, cacheKey, type Cache, type RemoteCache } from "../cache.ts";
import { createSupabaseCache } from "../supabaseCache.ts";
import { generationQueue } from "./queue.ts";
import { needsChunking, chunkText, mergeMaterials } from "./chunking.ts";
import { buildPrompt } from "./prompts.ts";

const memoryCache: Cache<GeneratedMaterial> = new InMemoryCache();
const defaultRemoteCache = createSupabaseCache();
// In-flight requests, so two identical concurrent calls share one generation.
const inFlight = new Map<string, Promise<GenerationOutcome>>();

/** Where the material came from. Only "generated" costs a model call. */
export type MaterialSource = "generated" | "memory" | "database";

export interface GenerationOutcome extends GenerationResult {
  source: MaterialSource;
}

export interface GenerateOptions {
  /** Inject a provider (tests / future backends). Defaults to getProvider(). */
  provider?: AIProvider;
  /** Cache + de-duplicate identical requests. Default true. */
  useCache?: boolean;
  /** Skip the cached copy and replace it with a new generation (Regenerate). */
  refresh?: boolean;
  /** Inject a durable cache (tests). Defaults to Supabase, when configured. */
  remoteCache?: RemoteCache<GeneratedMaterial> | null;
}

/**
 * What makes two requests interchangeable. The prompt and model are included so
 * that improving a prompt never serves material made with the old one. `covered`
 * is deliberately left out: it depends on the order a user generated formats in,
 * and including it would stop identical documents from sharing material.
 */
function requestKey(params: GenerateParams): string {
  const { system } = buildPrompt(params.mode, { ...params, documentText: "", covered: undefined });
  const model = process.env.GEMINI_MODEL?.trim() ?? "";
  const context = params.courseContext?.trim() ?? "";
  return cacheKey(params.documentText, params.mode, `${model}:${context}:${system}`);
}

/**
 * The single entry point callers (route, CLI) use. Adds, around the raw
 * provider: memory and database caching, concurrent de-duplication, a
 * serializing queue, and long-document chunking.
 */
export function generateStudyMaterial(
  params: GenerateParams,
  options: GenerateOptions = {},
): Promise<GenerationOutcome> {
  const useCache = options.useCache ?? true;
  const remote = useCache
    ? options.remoteCache === undefined
      ? defaultRemoteCache
      : options.remoteCache
    : null;
  const key = requestKey(params);

  if (useCache && !options.refresh) {
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const promise = (async (): Promise<GenerationOutcome> => {
    if (useCache && !options.refresh) {
      const hit = await findCached(key, params, remote);
      if (hit) return { material: hit.material, usageTokens: 0, source: hit.source };
    }
    const provider = options.provider ?? getProvider();
    const result = await generationQueue.run(() => produce(provider, params));
    if (useCache) {
      memoryCache.set(key, result.material);
      await remote?.set(key, result.material);
    }
    return { ...result, source: "generated" };
  })();

  if (useCache) {
    inFlight.set(key, promise);
    const clear = () => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    };
    promise.then(clear, clear); // drop the in-flight entry once settled
  }
  return promise;
}

/** Look in memory first, then the database, keeping a database hit in memory. */
async function findCached(
  key: string,
  params: GenerateParams,
  remote: RemoteCache<GeneratedMaterial> | null,
): Promise<{ material: GeneratedMaterial; source: MaterialSource } | undefined> {
  const inMemory = memoryCache.get(key);
  if (inMemory) return { material: inMemory, source: "memory" };
  const stored = await remote?.get(key);
  if (stored?.mode !== params.mode) return undefined;
  memoryCache.set(key, stored);
  return { material: stored, source: "database" };
}

/** One document → one material, chunking + merging when the doc is huge. */
async function produce(
  provider: AIProvider,
  params: GenerateParams,
): Promise<GenerationResult> {
  if (!needsChunking(params.documentText)) {
    return provider.generateMaterial(params);
  }

  const chunks = chunkText(params.documentText);
  const parts: GeneratedMaterial[] = [];
  let usageTokens = 0;
  for (const chunk of chunks) {
    const r = await provider.generateMaterial({
      ...params,
      documentText: chunk,
    });
    parts.push(r.material);
    usageTokens += r.usageTokens;
  }
  return { material: mergeMaterials(params.mode, parts), usageTokens };
}

/** Test helper: wipe the memory cache + in-flight state. */
export function resetGenerationState(): void {
  memoryCache.clear();
  inFlight.clear();
}
