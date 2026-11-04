export type Mode = "summary" | "eli5" | "quiz" | "truefalse" | "flashcards";

export const MODES = [
  "summary",
  "eli5",
  "quiz",
  "truefalse",
  "flashcards",
] as const;

/**
 * The "testing" modes that quiz discrete facts. They share a coverage pool so a
 * concept tested in one isn't repeated in another (see GenerateParams.covered).
 * Summary/ELI5 are comprehensive prose and intentionally excluded.
 */
export const TESTING_MODES = ["quiz", "truefalse", "flashcards"] as const;

export function isTestingMode(mode: Mode): boolean {
  return (TESTING_MODES as readonly string[]).includes(mode);
}

export function isMode(value: unknown): value is Mode {
  return (
    typeof value === "string" && (MODES as readonly string[]).includes(value)
  );
}

// ---------- Summary ----------

/** A formula worth memorising, with a one-line plain-language explanation. */
export interface KeyFormula {
  /** LaTeX WITHOUT surrounding $ delimiters. */
  latex: string;
  explanation: string;
}

export interface SummarySection {
  heading: string;
  content: string;
  keyFormulas: KeyFormula[];
}

export interface SummaryMaterial {
  mode: "summary";
  title: string;
  sections: SummarySection[];
  examTips: string[];
}

// ---------- ELI5 (added in Step 3) ----------

export interface Analogy {
  concept: string;
  analogy: string;
}

export interface Eli5Material {
  mode: "eli5";
  title: string;
  explanation: string;
  analogies: Analogy[];
}

// ---------- Quiz (added in Step 3) ----------

export type Difficulty = "easy" | "medium" | "hard";

export interface QuizQuestion {
  question: string;
  /** Exactly 4 options. */
  options: string[];
  /** Index 0–3 of the correct option. */
  correctIndex: number;
  /** Exactly 4 explanations aligned with options: why each is right/wrong. */
  explanations: string[];
  difficulty: Difficulty;
}

export interface QuizMaterial {
  mode: "quiz";
  title: string;
  questions: QuizQuestion[];
}

// ---------- True / False ----------

export interface TrueFalseQuestion {
  /** A statement the student judges as true or false. */
  statement: string;
  /** true → the statement is true, false → it is false. */
  answer: boolean;
  /** Why the statement is true or false. */
  explanation: string;
  difficulty: Difficulty;
}

export interface TrueFalseMaterial {
  mode: "truefalse";
  title: string;
  questions: TrueFalseQuestion[];
}

// ---------- Flashcards ----------

export interface FlashcardCard {
  /** The prompt side — a term, question, or concept to recall. */
  front: string;
  /** The answer side — the definition / explanation / result. */
  back: string;
  difficulty: Difficulty;
}

export interface FlashcardMaterial {
  mode: "flashcards";
  title: string;
  cards: FlashcardCard[];
}

// ---------- Common ----------

export type GeneratedMaterial =
  | SummaryMaterial
  | Eli5Material
  | QuizMaterial
  | TrueFalseMaterial
  | FlashcardMaterial;

export interface GenerateParams {
  documentText: string;
  mode: Mode;
  /** Optional free-text hint from the student, e.g. course/chapter name. */
  courseContext?: string;
  /**
   * Concepts already covered by the student's OTHER testing-mode materials for
   * this document. The model should prefer fresh concepts and only repeat one
   * if the document has no more distinct material to reach the target count.
   */
  covered?: string[];
}

/** A provider's output: the material plus how many tokens the call cost. */
export interface GenerationResult {
  material: GeneratedMaterial;
  /** Total tokens (prompt + output + reasoning) used; 0 if the API didn't report. */
  usageTokens: number;
}

/** Languages material can be translated into. */
export type Language = "en" | "el";

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "el";
}

export interface TranslateParams {
  material: GeneratedMaterial;
  target: Language;
}

/**
 * The single surface every AI provider implements. Nothing provider-specific
 * (no @google/genai types) crosses this boundary, so a GroqProvider can be
 * dropped in later by implementing just this.
 */
export interface AIProvider {
  generateMaterial(params: GenerateParams): Promise<GenerationResult>;
  /** Translate the text of existing material, keeping its structure. */
  translateMaterial(params: TranslateParams): Promise<GenerationResult>;
}

export type AIErrorCode =
  | "MISSING_API_KEY"
  | "EMPTY_DOCUMENT"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "INVALID_RESPONSE"
  | "PROVIDER_ERROR";

/** Provider-agnostic error carrying a UI-safe `userMessage`. */
export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(
    code: AIErrorCode,
    userMessage: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(
      `[${code}] ${userMessage}`,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "AIProviderError";
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = options?.retryable ?? false;
  }
}
