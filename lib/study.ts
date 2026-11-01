import type { Difficulty, GeneratedMaterial, Mode } from "@/lib/ai/types";
import { TESTING_MODES, isTestingMode } from "@/lib/ai/types";

export const MODE_LIST: { id: Mode; label: string; blurb: string }[] = [
  {
    id: "summary",
    label: "Summary",
    blurb:
      "The lecture's key points, definitions and formulas, organized into sections.",
  },
  {
    id: "eli5",
    label: "Simple explanation",
    blurb: "The material in plain language, with analogies for the main concepts.",
  },
  {
    id: "quiz",
    label: "Quiz",
    blurb: "20 multiple-choice questions, with an explanation for every answer.",
  },
  {
    id: "truefalse",
    label: "True / False",
    blurb:
      "20 statements to judge as true or false, with an explanation for every answer.",
  },
  {
    id: "flashcards",
    label: "Flashcards",
    blurb: "20 cards for active recall, with repeat rounds for the ones you missed.",
  },
];

export type Meta = { totalPages: number; charCount: number; title: string | null };
export type Result = {
  material: GeneratedMaterial;
  meta: Meta;
  fileName: string;
  /** Where it came from. Anything but "generated" used no Gemini request. */
  source?: "generated" | "memory" | "database";
};
/** The generated material of one study, at most one per mode. */
export type Panels = Partial<Record<Mode, Result>>;

/** One PDF the user studied — holds every panel they generated for it. */
export type Session = {
  id: string;
  createdAt: number;
  fileName: string;
  panels: Panels;
};

export type Usage = { date: string; requests: number; tokens: number };

// Gemini's free-tier requests per day for gemini-2.5-flash, per project and model.
// Google doesn't publish this; 20 is the quotaValue its 429 response reported in
// October 2026. Edit if your tier or model changes. The counter is per browser and
// resets at local midnight, while the real quota resets at midnight Pacific time.
export const REQUEST_LIMIT = 20;

export const USAGE_HINT =
  "Today's usage in this browser, against Gemini's daily request limit. Resets every day.";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

// Formulas longer than this may need to wrap, so they can't be kept unbroken.
const MAX_UNBROKEN_LATEX = 40;

/**
 * The punctuation to keep on the same line as the inline formula before it, so
 * a line can't wrap between "$x$" and the "." that follows. Empty when none applies.
 */
export function punctuationToKeep(latex: string, nextText: string): string {
  if (latex.length > MAX_UNBROKEN_LATEX) return "";
  return /^[.,;:!?)\]]+/.exec(nextText)?.[0] ?? "";
}

/** Capital letter for an option index (0 → A, 1 → B, ...). */
export const optionLetter = (i: number) => String.fromCharCode(65 + i);

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Compact token count, e.g. 940, 12.3k, 1.4M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function usageLabel(usage: Usage): string {
  return `${usage.requests}/${REQUEST_LIMIT} Req · ${formatTokens(usage.tokens)} Tokens`;
}

/** Local YYYY-MM-DD, used to reset the daily usage counter. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Labels of the modes present in a session, e.g. "Summary · Quiz". */
export function sessionModes(panels: Panels): string {
  return MODE_LIST.filter((m) => panels[m.id])
    .map((m) => m.label)
    .join(" · ");
}

/**
 * Concepts already covered by the OTHER testing-mode panels for this document,
 * so the model can avoid repeating them. Summary/ELI5 are excluded on purpose.
 */
export function extractCovered(panels: Panels, mode: Mode): string[] {
  if (!isTestingMode(mode)) return [];
  const out: string[] = [];
  for (const m of TESTING_MODES) {
    if (m === mode) continue;
    const mat = panels[m]?.material;
    if (!mat) continue;
    if (mat.mode === "quiz") out.push(...mat.questions.map((q) => q.question));
    else if (mat.mode === "truefalse")
      out.push(...mat.questions.map((q) => q.statement));
    else if (mat.mode === "flashcards")
      out.push(...mat.cards.map((c) => c.front));
  }
  return out;
}

/** Bucket a timestamp into a history group. */
function dateGroup(ts: number): string {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  return "Older";
}

/** Group already-newest-first sessions, preserving group order of appearance. */
export function groupSessions(sessions: Session[]): [string, Session[]][] {
  const groups: [string, Session[]][] = [];
  for (const s of sessions) {
    const g = dateGroup(s.createdAt);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(s);
    else groups.push([g, [s]]);
  }
  return groups;
}
