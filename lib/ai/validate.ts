import { AIProviderError } from "./types.ts";
import type {
  SummaryMaterial,
  Eli5Material,
  QuizMaterial,
  TrueFalseMaterial,
  FlashcardMaterial,
  Difficulty,
  GeneratedMaterial,
  Mode,
} from "./types.ts";

/**
 * Validators that turn an `unknown` parsed JSON blob (from any provider) into a
 * typed, trusted material — or throw an AIProviderError. Kept provider-
 * agnostic and side-effect free so it can be unit-tested without the network.
 */

function fail(detail: string): never {
  throw new AIProviderError(
    "INVALID_RESPONSE",
    "The model returned an invalid response. Try again.",
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

// The UI only renders $...$ and $$...$$, but the model sometimes answers with
// \(...\) and \[...\] instead. The lookbehind keeps a matrix row break followed
// by a spacing argument, like \\[2pt], from being read as a delimiter.
const INLINE_DELIMS_RE = /(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g;
const DISPLAY_DELIMS_RE = /(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g;

function normalizeMathDelimiters(s: string): string {
  return s
    .replace(DISPLAY_DELIMS_RE, (_, math: string) => `$$${math}$$`)
    .replace(INLINE_DELIMS_RE, (_, math: string) => `$${math}$`);
}

// The model sometimes escapes twice, so a parsed value holds \\lambda instead of
// \lambda. A double backslash can also be a legitimate matrix row break, so a
// value only counts as over-escaped when a double backslash leads a command or
// delimiter AND no properly escaped command appears anywhere in it. \\[2pt] is
// a row break with a spacing argument, not a delimiter.
const OVER_ESCAPED_RE = /(?<!\\)\\\\(?:[a-zA-Z]{2}|\(|\[(?!\s*-?[\d.]+\s*[a-z]{2}\]))/;
const PROPER_COMMAND_RE = /(?<!\\)\\[a-zA-Z(\[]/;

function repairOverEscaping(s: string): string {
  if (!OVER_ESCAPED_RE.test(s) || PROPER_COMMAND_RE.test(s)) return s;
  return s.replace(/\\\\/g, "\\");
}

function str(value: unknown): string {
  return typeof value === "string"
    ? normalizeMathDelimiters(repairOverEscaping(repairLatexEscapes(value))).trim()
    : "";
}

/** A formula's LaTeX, without delimiters: the views add their own around it. */
function bareLatex(value: unknown): string {
  return str(value).replace(/^\$+|\$+$/g, "").trim();
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
            return { latex: bareLatex(kf.latex), explanation: str(kf.explanation) };
          })
          .filter((kf) => kf.latex.length > 0),
      };
    })
    .filter((s) => s.heading.length > 0 || s.content.length > 0);

  if (sections.length === 0) fail("summary has no usable sections");

  return {
    mode: "summary",
    title: str(root.title) || "Summary",
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
    title: str(root.title) || "Simple explanation",
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
    title: str(root.title) || "True / False",
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

  return { mode: "flashcards", title: str(root.title) || "Flashcards", cards };
}

/** Validate raw JSON as the material of the given mode. */
export function parseMaterial(mode: Mode, raw: unknown): GeneratedMaterial {
  switch (mode) {
    case "summary":
      return parseSummary(raw);
    case "eli5":
      return parseEli5(raw);
    case "quiz":
      return parseQuiz(raw);
    case "truefalse":
      return parseTrueFalse(raw);
    case "flashcards":
      return parseFlashcards(raw);
    default:
      return fail("unknown mode");
  }
}

// ---------- Translation ----------

const MATH_RE = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;

/**
 * Undo changes the model made to formulas, e.g. "translating" the words inside
 * \text{}; the original is always right. A formula that exists unchanged in the
 * original stays where the translation put it, since another language may order
 * the sentence differently. Only an altered one is replaced, by the original at
 * the same position, and only when both have the same number of formulas.
 */
export function restoreMath(original: string, translated: string): string {
  const from = original.match(MATH_RE) ?? [];
  const into = translated.match(MATH_RE) ?? [];
  if (from.length === 0 || from.length !== into.length) return translated;
  const known = new Set(from);
  let i = 0;
  return translated.replace(MATH_RE, (m) => {
    const replacement = known.has(m) ? m : from[i];
    i++;
    return replacement;
  });
}

/** A translated string, falling back to the original if the model left it empty. */
function text(original: string, translated: string | undefined): string {
  return translated ? restoreMath(original, translated) : original;
}

/** Same number of items, or the translation can't be lined up with the original. */
function sameLength(original: unknown[], translated: unknown[], what: string): void {
  if (original.length !== translated.length) {
    fail(`translation changed the number of ${what}: ${original.length} → ${translated.length}`);
  }
}

/**
 * Combine the original's structure with the translation's words. Answers,
 * difficulties, item counts and formulas always come from the original, so a
 * translation can never change what is correct.
 */
export function mergeTranslation(
  original: GeneratedMaterial,
  translated: GeneratedMaterial,
): GeneratedMaterial {
  if (translated.mode !== original.mode) fail("translation changed the mode");
  const title = text(original.title, translated.title);

  switch (original.mode) {
    case "summary": {
      const t = translated as SummaryMaterial;
      sameLength(original.sections, t.sections, "sections");
      sameLength(original.examTips, t.examTips, "exam tips");
      return {
        mode: "summary",
        title,
        sections: original.sections.map((s, i) => {
          const ts = t.sections[i];
          sameLength(s.keyFormulas, ts.keyFormulas, "formulas");
          return {
            heading: text(s.heading, ts.heading),
            content: text(s.content, ts.content),
            keyFormulas: s.keyFormulas.map((f, j) => ({
              latex: f.latex,
              explanation: text(f.explanation, ts.keyFormulas[j].explanation),
            })),
          };
        }),
        examTips: original.examTips.map((tip, i) => text(tip, t.examTips[i])),
      };
    }
    case "eli5": {
      const t = translated as Eli5Material;
      sameLength(original.analogies, t.analogies, "analogies");
      return {
        mode: "eli5",
        title,
        explanation: text(original.explanation, t.explanation),
        analogies: original.analogies.map((a, i) => ({
          concept: text(a.concept, t.analogies[i].concept),
          analogy: text(a.analogy, t.analogies[i].analogy),
        })),
      };
    }
    case "quiz": {
      const t = translated as QuizMaterial;
      sameLength(original.questions, t.questions, "questions");
      return {
        mode: "quiz",
        title,
        questions: original.questions.map((q, i) => {
          const tq = t.questions[i];
          sameLength(q.options, tq.options, "options");
          return {
            question: text(q.question, tq.question),
            options: q.options.map((o, j) => text(o, tq.options[j])),
            correctIndex: q.correctIndex,
            explanations: q.explanations.map((e, j) => text(e, tq.explanations[j])),
            difficulty: q.difficulty,
          };
        }),
      };
    }
    case "truefalse": {
      const t = translated as TrueFalseMaterial;
      sameLength(original.questions, t.questions, "statements");
      return {
        mode: "truefalse",
        title,
        questions: original.questions.map((q, i) => ({
          statement: text(q.statement, t.questions[i].statement),
          answer: q.answer,
          explanation: text(q.explanation, t.questions[i].explanation),
          difficulty: q.difficulty,
        })),
      };
    }
    case "flashcards": {
      const t = translated as FlashcardMaterial;
      sameLength(original.cards, t.cards, "cards");
      return {
        mode: "flashcards",
        title,
        cards: original.cards.map((c, i) => ({
          front: text(c.front, t.cards[i].front),
          back: text(c.back, t.cards[i].back),
          difficulty: c.difficulty,
        })),
      };
    }
  }
}
