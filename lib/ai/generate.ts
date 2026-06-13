import { getProvider } from "./provider.ts";
import type {
  AIProvider,
  GenerateParams,
  GeneratedMaterial,
  GenerationResult,
} from "./types.ts";
import { InMemoryCache, cacheKey, type Cache } from "../cache.ts";
import { generationQueue } from "./queue.ts";
import { needsChunking, chunkText, mergeMaterials } from "./chunking.ts";

const materialCache: Cache<GeneratedMaterial> = new InMemoryCache();
// In-flight requests, so two identical concurrent calls share one generation.
const inFlight = new Map<string, Promise<GenerationResult>>();

export interface GenerateOptions {
  /** Inject a provider (tests / future backends). Defaults to getProvider(). */
  provider?: AIProvider;
  /** Cache + de-duplicate identical requests. Default true. */
  useCache?: boolean;
}

/**
 * The single entry point callers (route, CLI) use. Adds, around the raw
 * provider: SHA-256 caching, concurrent de-duplication, a serializing queue,
 * and long-document chunking.
 */
export function generateStudyMaterial(
  params: GenerateParams,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const provider = options.provider ?? getProvider();
  const useCache = options.useCache ?? true;
  // Coverage changes the output, so it must be part of the cache identity.
  const coverageSalt = params.covered?.length ? params.covered.join("|") : "";
  const key = cacheKey(params.documentText, params.mode, coverageSalt);

  if (useCache) {
    const cached = materialCache.get(key);
    // A cache hit makes no API call, so it costs zero tokens.
    if (cached) return Promise.resolve({ material: cached, usageTokens: 0 });
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const promise = (async () => {
    const result = await generationQueue.run(() => produce(provider, params));
    if (useCache) materialCache.set(key, result.material);
    return result;
  })();

  if (useCache) {
    inFlight.set(key, promise);
    const clear = () => inFlight.delete(key);
    promise.then(clear, clear); // drop the in-flight entry once settled
  }
  return promise;
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

/** Test helper: wipe cache + in-flight state. */
export function resetGenerationState(): void {
  materialCache.clear();
  inFlight.clear();
}
