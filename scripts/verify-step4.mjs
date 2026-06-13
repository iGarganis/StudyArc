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

console.log("\n--- toAIProviderError quota classification ---");
const e = (msg, status) => Object.assign(new Error(msg), { status });
ok(toAIProviderError(e("Quota exceeded ... GenerateRequestsPerDayPerProjectPerModel ... limit: 0", 429)).code === "QUOTA_EXHAUSTED", "daily/limit:0 → QUOTA_EXHAUSTED");
const perMin = toAIProviderError(e("Quota exceeded for GenerateRequestsPerMinutePerProjectPerModel-FreeTier. Please retry.", 429));
ok(perMin.code === "RATE_LIMITED" && perMin.retryable, "per-minute → RATE_LIMITED (retryable)");
ok(toAIProviderError(e("model is overloaded", 503)).code === "PROVIDER_ERROR", "503 → PROVIDER_ERROR");
ok(toAIProviderError(e("API key not valid", 401)).code === "MISSING_API_KEY", "401 → MISSING_API_KEY");

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exitCode = failures === 0 ? 0 : 1;
