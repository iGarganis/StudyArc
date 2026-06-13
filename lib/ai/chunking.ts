import type {
  GeneratedMaterial,
  Mode,
  SummaryMaterial,
  Eli5Material,
  QuizMaterial,
  QuizQuestion,
  TrueFalseMaterial,
  TrueFalseQuestion,
  FlashcardMaterial,
  FlashcardCard,
} from "./types.ts";

/**
 * Above this many characters, a document is split before generation. Set high
 * enough that a normal lecture (≈50–70 pages ≈ 125k–245k chars) goes to the
 * model in a SINGLE call — the best quality, since the model sees everything at
 * once. gemini-2.5-flash has a ~1M-token window, so ~400k chars is comfortable.
 * Only genuinely huge documents (120+ pages) get chunked.
 */
export const CHUNK_THRESHOLD = 400_000;
const MAX_CHUNK_CHARS = 200_000;
/** Target item count when merging quiz / true-false sets across chunks. */
const QUIZ_TARGET_QUESTIONS = 20;

export function needsChunking(text: string): boolean {
  return text.length > CHUNK_THRESHOLD;
}

/**
 * Split text into chunks no larger than `maxChars`, preferring paragraph
 * boundaries; a single oversized paragraph is hard-split as a last resort.
 */
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const para of text.split(/\n{2,}/)) {
    if (para.length > maxChars) {
      flush();
      for (let i = 0; i < para.length; i += maxChars) {
        chunks.push(para.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > maxChars) {
      flush();
      current = para;
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}

/** Merge per-chunk materials of the same mode into a single result. */
export function mergeMaterials(
  mode: Mode,
  parts: GeneratedMaterial[],
): GeneratedMaterial {
  if (parts.length === 1) return parts[0];
  if (mode === "summary") return mergeSummaries(parts as SummaryMaterial[]);
  if (mode === "eli5") return mergeEli5(parts as Eli5Material[]);
  if (mode === "truefalse")
    return mergeTrueFalse(parts as TrueFalseMaterial[]);
  if (mode === "flashcards")
    return mergeFlashcards(parts as FlashcardMaterial[]);
  return mergeQuizzes(parts as QuizMaterial[]); // mode === "quiz"
}

function mergeSummaries(parts: SummaryMaterial[]): SummaryMaterial {
  return {
    mode: "summary",
    title: parts[0].title,
    sections: parts.flatMap((p) => p.sections),
    examTips: dedupe(parts.flatMap((p) => p.examTips)),
  };
}

function mergeEli5(parts: Eli5Material[]): Eli5Material {
  return {
    mode: "eli5",
    title: parts[0].title,
    explanation: parts.map((p) => p.explanation).join("\n\n"),
    analogies: dedupeBy(
      parts.flatMap((p) => p.analogies),
      (a) => a.concept,
    ),
  };
}

/** Sample questions across chunks (round-robin) up to the target count. */
function mergeQuizzes(parts: QuizMaterial[]): QuizMaterial {
  const pools = parts.map((p) => [...p.questions]);
  const picked: QuizQuestion[] = [];
  let i = 0;
  while (picked.length < QUIZ_TARGET_QUESTIONS && pools.some((p) => p.length)) {
    const pool = pools[i % pools.length];
    const q = pool.shift();
    if (q) picked.push(q);
    i++;
  }
  return { mode: "quiz", title: parts[0].title, questions: picked };
}

/** Sample true/false statements across chunks (round-robin) up to target. */
function mergeTrueFalse(parts: TrueFalseMaterial[]): TrueFalseMaterial {
  const pools = parts.map((p) => [...p.questions]);
  const picked: TrueFalseQuestion[] = [];
  let i = 0;
  while (picked.length < QUIZ_TARGET_QUESTIONS && pools.some((p) => p.length)) {
    const q = pools[i % pools.length].shift();
    if (q) picked.push(q);
    i++;
  }
  return { mode: "truefalse", title: parts[0].title, questions: picked };
}

/** Sample flashcards across chunks (round-robin) up to the target count. */
function mergeFlashcards(parts: FlashcardMaterial[]): FlashcardMaterial {
  const pools = parts.map((p) => [...p.cards]);
  const picked: FlashcardCard[] = [];
  let i = 0;
  while (picked.length < QUIZ_TARGET_QUESTIONS && pools.some((p) => p.length)) {
    const card = pools[i % pools.length].shift();
    if (card) picked.push(card);
    i++;
  }
  return { mode: "flashcards", title: parts[0].title, cards: picked };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function dedupeBy<T>(items: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
