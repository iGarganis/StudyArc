import { getProvider } from "./provider.ts";
import type {
  AIProvider,
  GenerateParams,
  GeneratedMaterial,
  GenerationResult,
  Mode,
  TranslateParams,
} from "./types.ts";
import { InMemoryCache, cacheKey, type Cache, type RemoteCache } from "../cache.ts";
import { createSupabaseCache } from "../supabaseCache.ts";
import { generationQueue } from "./queue.ts";
import { needsChunking, chunkText, mergeMaterials } from "./chunking.ts";
import { buildPrompt, buildTranslatePrompt } from "./prompts.ts";

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

const model = () => process.env.GEMINI_MODEL?.trim() ?? "";

/**
 * What makes two requests interchangeable. The prompt and model are included so
 * that improving a prompt never serves material made with the old one. `covered`
 * is deliberately left out: it depends on the order a user generated formats in,
 * and including it would stop identical documents from sharing material.
 */
function requestKey(params: GenerateParams): string {
  const { system } = buildPrompt(params.mode, { ...params, documentText: "", covered: undefined });
  const context = params.courseContext?.trim() ?? "";
  return cacheKey(params.documentText, params.mode, `${model()}:${context}:${system}`);
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
  return runCached(requestKey(params), params.mode, options, (provider) =>
    generationQueue.run(() => produce(provider, params)),
  );
}

/**
 * Translate material into English or Greek, with the same caching. The key is
 * the material itself plus the target language, so translating the same
 * material again is free for everyone.
 */
export function translateStudyMaterial(
  params: TranslateParams,
  options: GenerateOptions = {},
): Promise<GenerationOutcome> {
  const { system } = buildTranslatePrompt(params.material, params.target);
  const key = cacheKey(
    JSON.stringify(params.material),
    `translate:${params.material.mode}`,
    `${params.target}:${model()}:${system}`,
  );
  return runCached(key, params.material.mode, options, (provider) =>
    generationQueue.run(() => provider.translateMaterial(params)),
  );
}

/** Check memory, then the database, then make the call and store its result. */
function runCached(
  key: string,
  mode: Mode,
  options: GenerateOptions,
  make: (provider: AIProvider) => Promise<GenerationResult>,
): Promise<GenerationOutcome> {
  const useCache = options.useCache ?? true;
  const remote = useCache
    ? options.remoteCache === undefined
      ? defaultRemoteCache
      : options.remoteCache
    : null;

  if (useCache && !options.refresh) {
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const promise = (async (): Promise<GenerationOutcome> => {
    if (useCache && !options.refresh) {
      const hit = await findCached(key, mode, remote);
      if (hit) return { material: hit.material, usageTokens: 0, source: hit.source };
    }
    const result = await make(options.provider ?? getProvider());
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
  mode: Mode,
  remote: RemoteCache<GeneratedMaterial> | null,
): Promise<{ material: GeneratedMaterial; source: MaterialSource } | undefined> {
  const inMemory = memoryCache.get(key);
  if (inMemory) return { material: inMemory, source: "memory" };
  const stored = await remote?.get(key);
  if (stored?.mode !== mode) return undefined;
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
