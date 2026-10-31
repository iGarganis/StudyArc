import type { Difficulty, GeneratedMaterial, Mode } from "@/lib/ai/types";
import { TESTING_MODES, isTestingMode } from "@/lib/ai/types";

export const MODE_LIST: { id: Mode; label: string; blurb: string }[] = [
  {
    id: "summary",
    label: "Σύνοψη",
    blurb:
      "Τα βασικά σημεία, οι ορισμοί και οι τύποι της διάλεξης, οργανωμένα σε ενότητες.",
  },
  {
    id: "eli5",
    label: "Απλή εξήγηση",
    blurb: "Η ύλη με απλά λόγια, με αναλογίες για τις βασικές έννοιες.",
  },
  {
    id: "quiz",
    label: "Quiz",
    blurb: "20 ερωτήσεις πολλαπλής επιλογής, με εξήγηση για κάθε απάντηση.",
  },
  {
    id: "truefalse",
    label: "Σωστό / Λάθος",
    blurb:
      "20 δηλώσεις για να ελέγξετε αν κάτι ισχύει ή όχι, με εξήγηση για κάθε απάντηση.",
  },
  {
    id: "flashcards",
    label: "Κάρτες",
    blurb: "20 κάρτες για ενεργή ανάκληση, με επανάληψη όσων δεν γνωρίζατε.",
  },
];

export type Meta = { totalPages: number; charCount: number; title: string | null };
export type Result = { material: GeneratedMaterial; meta: Meta; fileName: string };
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

// Gemini free-tier reference limits (gemini-2.5-flash). Edit if your tier changes.
export const REQUEST_LIMIT = 250; // requests per day
export const TOKEN_LIMIT = 250_000; // tokens

export const USAGE_HINT =
  "Σημερινή χρήση σε σχέση με τα ημερήσια όρια του Gemini. Μηδενίζει κάθε μέρα.";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Εύκολη",
  medium: "Μέτρια",
  hard: "Δύσκολη",
};

/** Greek capital letter for an option index (0 → Α, 1 → Β, ...). */
export const optionLetter = (i: number) => String.fromCharCode(913 + i);

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
  return (
    `${usage.requests}/${REQUEST_LIMIT} Req · ` +
    `${formatTokens(usage.tokens)}/${formatTokens(TOKEN_LIMIT)} Tokens`
  );
}

/** Local YYYY-MM-DD, used to reset the daily usage counter. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Labels of the modes present in a session, e.g. "Σύνοψη · Quiz". */
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
  if (days <= 0) return "Σήμερα";
  if (days === 1) return "Χθες";
  if (days < 7) return "Αυτή την εβδομάδα";
  if (days < 30) return "Αυτόν τον μήνα";
  return "Παλαιότερα";
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
