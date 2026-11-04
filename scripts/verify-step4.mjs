import {
  generateStudyMaterial,
  resetGenerationState,
} from "../lib/ai/generate.ts";
import { cacheKey, InMemoryCache } from "../lib/cache.ts";
import { AsyncQueue } from "../lib/ai/queue.ts";
import {
  needsChunking,
  chunkText,
  mergeMaterials,
  CHUNK_THRESHOLD,
} from "../lib/ai/chunking.ts";
import { toAIProviderError } from "../lib/ai/gemini.ts";
import { createClient } from "@supabase/supabase-js";
import { SupabaseCache, createSupabaseCache } from "../lib/supabaseCache.ts";

let failures = 0;
const ok = (cond, name, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? "  -> " + extra : ""}`);
  if (!cond) failures++;
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// material factories
const sm = (t = "T") => ({ mode: "summary", title: t, sections: [{ heading: "h", content: "c", keyFormulas: [] }], examTips: ["tip"] });
const el = (t = "T") => ({ mode: "eli5", title: t, explanation: "e", analogies: [{ concept: "k", analogy: "a" }] });
const qz = (t = "T", n = 6) => ({ mode: "quiz", title: t, questions: Array.from({ length: n }, (_, i) => ({ question: `q${i}`, options: ["a", "b", "c", "d"], correctIndex: 0, explanations: ["", "", "", ""], difficulty: "easy" })) });
const factory = (p) => (p.mode === "summary" ? sm() : p.mode === "eli5" ? el() : qz());
const stub = (fn = factory) => {
  let calls = 0;
  return { provider: { async generateMaterial(p) { calls++; await delay(5); return { material: fn(p), usageTokens: 100 }; } }, calls: () => calls };
};

console.log("--- cacheKey ---");
ok(cacheKey("x", "summary") === cacheKey("x", "summary"), "stable for same input");
ok(cacheKey("x", "summary") !== cacheKey("x", "eli5"), "differs by mode");
ok(cacheKey("x", "summary") !== cacheKey("y", "summary"), "differs by text");

console.log("\n--- InMemoryCache ---");
const c = new InMemoryCache();
c.set("k", 1);
ok(c.get("k") === 1, "set/get");
c.delete("k");
ok(c.get("k") === undefined, "delete");

console.log("\n--- AsyncQueue ---");
const q = new AsyncQueue();
let active = 0, maxActive = 0;
const order = [];
const task = (id) => () => { active++; maxActive = Math.max(maxActive, active); return delay(10).then(() => { order.push(id); active--; return id; }); };
await Promise.all([q.run(task(1)), q.run(task(2)), q.run(task(3))]);
ok(maxActive === 1, "only one task at a time", `maxActive=${maxActive}`);
ok(order.join("") === "123", "preserves order", order.join(""));
let ran = false;
await q.run(() => Promise.reject(new Error("boom"))).catch(() => {});
await q.run(() => { ran = true; return Promise.resolve(); });
ok(ran, "survives a failing task");

console.log("\n--- chunkText / needsChunking ---");
ok(!needsChunking("short"), "small doc: no chunking");
ok(needsChunking("a".repeat(CHUNK_THRESHOLD + 1)), "huge doc: needs chunking");
ok(chunkText("small").length === 1, "small text → 1 chunk");
const chunks = chunkText("a".repeat(300_000), 120_000);
ok(chunks.length === 3, "300k/120k → 3 chunks", `${chunks.length}`);
ok(chunks.every((c) => c.length <= 120_000), "each chunk ≤ maxChars");

console.log("\n--- mergeMaterials ---");
const mSum = mergeMaterials("summary", [
  { mode: "summary", title: "A", sections: [{ heading: "h1", content: "c1", keyFormulas: [] }], examTips: ["t1", "shared"] },
  { mode: "summary", title: "B", sections: [{ heading: "h2", content: "c2", keyFormulas: [] }], examTips: ["t2", "shared"] },
]);
ok(mSum.sections.length === 2, "summary: sections combined", `${mSum.sections.length}`);
ok(mSum.examTips.length === 3, "summary: examTips deduped", `${mSum.examTips.length}`);
const mEli = mergeMaterials("eli5", [
  { mode: "eli5", title: "A", explanation: "e1", analogies: [{ concept: "x", analogy: "a1" }] },
  { mode: "eli5", title: "B", explanation: "e2", analogies: [{ concept: "x", analogy: "a2" }, { concept: "y", analogy: "a3" }] },
]);
ok(mEli.explanation.includes("e1") && mEli.explanation.includes("e2"), "eli5: explanations joined");
ok(mEli.analogies.length === 2, "eli5: analogies deduped by concept", `${mEli.analogies.length}`);
const mQuiz = mergeMaterials("quiz", [qz("A", 15), qz("B", 15)]);
ok(mQuiz.questions.length === 20, "quiz: sampled to 20", `${mQuiz.questions.length}`);
const mTf = mergeMaterials("truefalse", [
  { mode: "truefalse", title: "A", questions: Array.from({ length: 15 }, (_, i) => ({ statement: `s${i}`, answer: i % 2 === 0, explanation: "", difficulty: "easy" })) },
  { mode: "truefalse", title: "B", questions: Array.from({ length: 15 }, (_, i) => ({ statement: `t${i}`, answer: i % 2 === 0, explanation: "", difficulty: "easy" })) },
]);
ok(mTf.questions.length === 20, "true/false: sampled to 20", `${mTf.questions.length}`);

console.log("\n--- generateStudyMaterial (cache / dedup / chunking) ---");
resetGenerationState();
let s = stub();
const pA = { documentText: "doc-A", mode: "summary" };
await generateStudyMaterial(pA, { provider: s.provider });
await generateStudyMaterial(pA, { provider: s.provider });
ok(s.calls() === 1, "cache: identical calls → 1 provider call", `calls=${s.calls()}`);
await generateStudyMaterial({ documentText: "doc-A", mode: "eli5" }, { provider: s.provider });
ok(s.calls() === 2, "cache: different mode regenerates", `calls=${s.calls()}`);

resetGenerationState();
s = stub();
const pB = { documentText: "doc-B", mode: "summary" };
await Promise.all([
  generateStudyMaterial(pB, { provider: s.provider }),
  generateStudyMaterial(pB, { provider: s.provider }),
]);
ok(s.calls() === 1, "in-flight: concurrent identical calls deduped", `calls=${s.calls()}`);

resetGenerationState();
s = stub();
await generateStudyMaterial({ documentText: "doc-C", mode: "summary" }, { provider: s.provider, useCache: false });
await generateStudyMaterial({ documentText: "doc-C", mode: "summary" }, { provider: s.provider, useCache: false });
ok(s.calls() === 2, "useCache:false always regenerates", `calls=${s.calls()}`);

resetGenerationState();
s = stub();
const big = "α".repeat(CHUNK_THRESHOLD + 50_000);
const merged = await generateStudyMaterial({ documentText: big, mode: "summary" }, { provider: s.provider, useCache: false });
ok(s.calls() >= 2, "chunking: huge doc → multiple provider calls", `calls=${s.calls()}`);
ok(merged.material.mode === "summary" && merged.material.sections.length >= 2, "chunking: merged result spans chunks", `sections=${merged.material.sections.length}`);
ok(merged.usageTokens >= 200, "chunking: usage tokens summed across chunks", `tokens=${merged.usageTokens}`);

console.log("\n--- database cache ---");
const fakeRemote = () => {
  const rows = new Map();
  return { rows, reads: 0, writes: 0, async get(k) { this.reads++; return rows.get(k); }, async set(k, v) { this.writes++; rows.set(k, v); } };
};
{
  // No Gemini call when another server process already generated this document.
  resetGenerationState();
  let remote = fakeRemote();
  s = stub();
  const pD = { documentText: "doc-D", mode: "summary" };
  const first = await generateStudyMaterial(pD, { provider: s.provider, remoteCache: remote });
  ok(first.source === "generated" && first.usageTokens === 100 && remote.writes === 1, "first request generates and stores");
  resetGenerationState(); // what a server restart does to the memory cache
  const second = await generateStudyMaterial(pD, { provider: s.provider, remoteCache: remote });
  ok(second.source === "database" && second.usageTokens === 0 && s.calls() === 1, "after a restart: served from the database", `calls=${s.calls()}`);
  const readsBefore = remote.reads;
  const third = await generateStudyMaterial(pD, { provider: s.provider, remoteCache: remote });
  ok(third.source === "memory" && remote.reads === readsBefore, "then served from memory, without a database read");

  // Regenerate replaces the stored copy.
  const fresh = await generateStudyMaterial(pD, { provider: stub(() => sm("new")).provider, remoteCache: remote, refresh: true });
  ok(fresh.source === "generated" && fresh.material.title === "new", "refresh: skips the cached copy");
  resetGenerationState();
  const after = await generateStudyMaterial(pD, { provider: s.provider, remoteCache: remote });
  ok(after.source === "database" && after.material.title === "new", "refresh: replaces the stored copy");

  // The order formats were generated in must not split the cache.
  resetGenerationState();
  remote = fakeRemote();
  s = stub();
  await generateStudyMaterial({ documentText: "doc-E", mode: "quiz", covered: ["a"] }, { provider: s.provider, remoteCache: remote });
  const noCover = await generateStudyMaterial({ documentText: "doc-E", mode: "quiz" }, { provider: s.provider, remoteCache: remote });
  ok(noCover.source === "memory" && s.calls() === 1, "covered concepts don't change the key");

  // Bad or failing storage must never break generation.
  resetGenerationState();
  s = stub();
  const wrong = { async get() { return el(); }, async set() {} };
  const r1 = await generateStudyMaterial({ documentText: "doc-F", mode: "summary" }, { provider: s.provider, remoteCache: wrong });
  ok(r1.source === "generated" && r1.material.mode === "summary", "a stored row of the wrong mode is ignored");
}
{
  const makeClient = (fetchImpl) => createClient("https://example.supabase.co", "sb_secret_test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const quiet = console.error;
  const logs = [];
  console.error = (m) => logs.push(String(m));

  const seen = [];
  const good = new SupabaseCache(makeClient(async (url, init) => {
    seen.push({ url: String(url), method: init?.method, body: init?.body });
    return init?.method === "POST" ? json(null, 201) : json({ material: sm("stored") });
  }));
  const got = await good.get("key-1");
  ok(got?.title === "stored", "supabase: reads the material");
  ok(seen[0].url.includes("material_cache") && seen[0].url.includes("cache_key=eq.key-1"), "supabase: queries by cache key", seen[0].url);
  await good.set("key-2", sm());
  const sent = JSON.parse(seen[1].body);
  ok(seen[1].method === "POST" && sent.cache_key === "key-2" && sent.mode === "summary", "supabase: writes key, mode and material");

  const empty = new SupabaseCache(makeClient(async () => new Response(JSON.stringify({ code: "PGRST116", message: "no rows" }), { status: 406, headers: { "content-type": "application/json" } })));
  ok((await empty.get("none")) === undefined, "supabase: a missing row is a miss");

  const down = new SupabaseCache(makeClient(async () => { throw new TypeError("fetch failed"); }));
  ok((await down.get("k")) === undefined, "supabase: network failure on read is a miss");
  await down.set("k", sm());
  ok(true, "supabase: network failure on write doesn't throw");

  const hanging = new SupabaseCache(makeClient((_, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  })), 50);
  const started = Date.now();
  // AbortSignal.timeout doesn't keep Node alive by itself; a server always is.
  const keepAlive = setTimeout(() => {}, 5000);
  const timedOut = await hanging.get("k");
  clearTimeout(keepAlive);
  ok(timedOut === undefined && Date.now() - started < 1000, "supabase: a paused database times out quickly", `${Date.now() - started}ms`);

  const failing = new SupabaseCache(makeClient(async () => json({ message: "relation does not exist" }, 404)));
  ok((await failing.get("k")) === undefined, "supabase: a missing table is a miss");
  console.error = quiet;

  ok(createSupabaseCache("", "") === null, "supabase: unconfigured → no database cache");
  console.error = (m) => logs.push(String(m));
  ok(createSupabaseCache("not-a-url", "sb_secret_test") === null, "supabase: a malformed URL → no database cache, no crash");
  console.error = quiet;
  ok(logs.every((l) => !l.includes("sb_secret_test")), "supabase: the secret key never reaches the logs");

  // End to end through generate: a broken database still gives a result.
  resetGenerationState();
  s = stub();
  console.error = () => {};
  const res = await generateStudyMaterial({ documentText: "doc-G", mode: "summary" }, { provider: s.provider, remoteCache: down });
  console.error = quiet;
  ok(res.source === "generated" && s.calls() === 1 && res.material.mode === "summary", "generation still works with the database down");
}

console.log("\n--- translation caching ---");
{
  const { translateStudyMaterial } = await import("../lib/ai/generate.ts");
  resetGenerationState();
  const remote = fakeRemote();
  let calls = 0;
  const provider = {
    async generateMaterial() { throw new Error("not used"); },
    async translateMaterial({ material, target }) { calls++; return { material: { ...material, title: `${target}:${material.title}` }, usageTokens: 50 }; },
  };
  const material = sm("Original");
  const first = await translateStudyMaterial({ material, target: "en" }, { provider, remoteCache: remote });
  ok(first.source === "generated" && first.material.title === "en:Original" && calls === 1, "translate: first call goes to the model");
  resetGenerationState();
  const again = await translateStudyMaterial({ material, target: "en" }, { provider, remoteCache: remote });
  ok(again.source === "database" && calls === 1, "translate: the same translation comes from the database");
  const other = await translateStudyMaterial({ material, target: "el" }, { provider, remoteCache: remote });
  ok(other.source === "generated" && other.material.title === "el:Original" && calls === 2, "translate: another language is a new translation");
  const changed = await translateStudyMaterial({ material: sm("Different"), target: "en" }, { provider, remoteCache: remote });
  ok(changed.source === "generated" && calls === 3, "translate: different material is a new translation");
  const gen = await generateStudyMaterial({ documentText: "doc-T", mode: "summary" }, { provider: stub().provider, remoteCache: remote });
  ok(gen.source === "generated", "translate: translations don't collide with generated material");
}

console.log("\n--- toAIProviderError quota classification ---");
const e = (msg, status) => Object.assign(new Error(msg), { status });
ok(toAIProviderError(e("Quota exceeded ... GenerateRequestsPerDayPerProjectPerModel ... limit: 0", 429)).code === "QUOTA_EXHAUSTED", "daily/limit:0 → QUOTA_EXHAUSTED");
const perMin = toAIProviderError(e("Quota exceeded for GenerateRequestsPerMinutePerProjectPerModel-FreeTier. Please retry.", 429));
ok(perMin.code === "RATE_LIMITED" && perMin.retryable, "per-minute → RATE_LIMITED (retryable)");
// Both real 429 messages open with the same sentence about billing.
const billing = "You exceeded your current quota, please check your plan and billing details.";
const daily = toAIProviderError(e(`${billing} Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash, description: Generate content requests per day limit exceeded on Free Tier.`, 429));
ok(daily.code === "QUOTA_EXHAUSTED" && !daily.retryable, "real daily 429 → QUOTA_EXHAUSTED");
const minute = toAIProviderError(e(`${billing} Quota exceeded for GenerateRequestsPerMinutePerProjectPerModel-FreeTier, limit: 10.`, 429));
ok(minute.code === "RATE_LIMITED" && minute.retryable, "per-minute 429 mentioning billing → RATE_LIMITED");
ok(toAIProviderError(e("model is overloaded", 503)).code === "PROVIDER_ERROR", "503 → PROVIDER_ERROR");
ok(toAIProviderError(e("API key not valid", 401)).code === "MISSING_API_KEY", "401 → MISSING_API_KEY");

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exitCode = failures === 0 ? 0 : 1;
