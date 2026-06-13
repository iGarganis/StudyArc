import { AIProviderError } from "./types.ts";
import type {
  SummaryMaterial,
  Eli5Material,
  QuizMaterial,
  TrueFalseMaterial,
  FlashcardMaterial,
  Difficulty,
} from "./types.ts";

/**
 * Validators that turn an `unknown` parsed JSON blob (from any provider) into a
 * typed, trusted material — or throw a Greek AIProviderError. Kept provider-
 * agnostic and side-effect free so it can be unit-tested without the network.
 */

function fail(detail: string): never {
  throw new AIProviderError(
    "INVALID_RESPONSE",
    "Το μοντέλο επέστρεψε μη έγκυρη απάντηση. Δοκίμασε ξανά.",
    { retryable: true, cause: new Error(detail) },
  );
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// Control chars that are almost certainly an under-escaped LaTeX backslash
// command from the model: in JSON, e.g. "\text" gets emitted as "\t" and parsed
// to a TAB. Legitimate model prose never contains these, so we restore the
// backslash form. (LF 0x0A is intentionally excluded — it can be a real break.)
const REPAIR_MAP: Record<string, string> = {
  [String.fromCharCode(0x08)]: "\\b", // \beta, \binom ...
  [String.fromCharCode(0x09)]: "\\t", // \text, \theta, \times, \tau ...
  [String.fromCharCode(0x0b)]: "\\v", // \vec, \varphi ...
  [String.fromCharCode(0x0c)]: "\\f", // \frac, \forall ...
  [String.fromCharCode(0x0d)]: "\\r", // \right, \rho ...
};
const REPAIR_RE = new RegExp(`[${Object.keys(REPAIR_MAP).join("")}]`, "g");

function repairLatexEscapes(s: string): string {
  return s.replace(REPAIR_RE, (c) => REPAIR_MAP[c] ?? c);
}

function str(value: unknown): string {
  return typeof value === "string" ? repairLatexEscapes(value).trim() : "";
}

export function parseSummary(raw: unknown): SummaryMaterial {
  const root = asObject(raw, "summary");

  const sections = asArray(root.sections)
    .map((s) => {
      const sec = asObject(s, "section");
      return {
        heading: str(sec.heading),
        content: str(sec.content),
        keyFormulas: asArray(sec.keyFormulas)
          .map((f) => {
            const kf = asObject(f, "keyFormula");
            return { latex: str(kf.latex), explanation: str(kf.explanation) };
          })
          .filter((kf) => kf.latex.length > 0),
      };
    })
    .filter((s) => s.heading.length > 0 || s.content.length > 0);

  if (sections.length === 0) fail("summary has no usable sections");

  return {
    mode: "summary",
    title: str(root.title) || "Σύνοψη",
    sections,
    examTips: asArray(root.examTips)
      .map((t) => str(t))
      .filter((t) => t.length > 0),
  };
}

export function parseEli5(raw: unknown): Eli5Material {
  const root = asObject(raw, "eli5");

  const explanation = str(root.explanation);
  if (!explanation) fail("eli5 has no explanation");

  return {
    mode: "eli5",
    title: str(root.title) || "Απλή εξήγηση",
    explanation,
    analogies: asArray(root.analogies)
      .map((a) => {
        const o = asObject(a, "analogy");
        return { concept: str(o.concept), analogy: str(o.analogy) };
      })
      .filter((a) => a.analogy.length > 0),
  };
}

const DIFFICULTIES = new Set<Difficulty>(["easy", "medium", "hard"]);

export function parseQuiz(raw: unknown): QuizMaterial {
  const root = asObject(raw, "quiz");

  const questions = asArray(root.questions)
    .map((q) => {
      const o = asObject(q, "question");
      const options = asArray(o.options)
        .map((x) => str(x))
        .filter((x) => x.length > 0);
      const rawDiff = str(o.difficulty).toLowerCase() as Difficulty;
      const difficulty: Difficulty = DIFFICULTIES.has(rawDiff)
        ? rawDiff
        : "medium";
      return {
        question: str(o.question),
        options,
        correctIndex:
          typeof o.correctIndex === "number" ? Math.trunc(o.correctIndex) : 0,
        explanations: asArray(o.explanations).map((x) => str(x)),
        difficulty,
      };
    })
    .filter((q) => q.question.length > 0 && q.options.length >= 2)
    .map((q) => ({
      ...q,
      // clamp the answer index and align explanations to the options length
      correctIndex: Math.min(Math.max(q.correctIndex, 0), q.options.length - 1),
      explanations: q.options.map((_, i) => q.explanations[i] ?? ""),
    }));

  if (questions.length === 0) fail("quiz has no usable questions");

  return { mode: "quiz", title: str(root.title) || "Quiz", questions };
}

export function parseTrueFalse(raw: unknown): TrueFalseMaterial {
  const root = asObject(raw, "truefalse");

  const questions = asArray(root.questions)
    .map((q) => {
      const o = asObject(q, "statement");
      const rawDiff = str(o.difficulty).toLowerCase() as Difficulty;
      const difficulty: Difficulty = DIFFICULTIES.has(rawDiff)
        ? rawDiff
        : "medium";
      return {
        statement: str(o.statement),
        answer: o.answer === true,
        explanation: str(o.explanation),
        difficulty,
      };
    })
    .filter((q) => q.statement.length > 0);

  if (questions.length === 0) fail("true/false has no usable statements");

  return {
    mode: "truefalse",
    title: str(root.title) || "Σωστό / Λάθος",
    questions,
  };
}

export function parseFlashcards(raw: unknown): FlashcardMaterial {
  const root = asObject(raw, "flashcards");

  const cards = asArray(root.cards)
    .map((c) => {
      const o = asObject(c, "card");
      const rawDiff = str(o.difficulty).toLowerCase() as Difficulty;
      const difficulty: Difficulty = DIFFICULTIES.has(rawDiff)
        ? rawDiff
        : "medium";
      return { front: str(o.front), back: str(o.back), difficulty };
    })
    .filter((c) => c.front.length > 0 && c.back.length > 0);

  if (cards.length === 0) fail("flashcards has no usable cards");

  return { mode: "flashcards", title: str(root.title) || "Κάρτες", cards };
}
