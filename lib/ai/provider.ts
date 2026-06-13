import type { AIProvider } from "./types.ts";
import { GeminiProvider } from "./gemini.ts";

let cached: AIProvider | null = null;

/**
 * Returns the configured AI provider (singleton). To support another backend
 * later (e.g. Groq), switch on an env var here — callers never change.
 */
export function getProvider(): AIProvider {
  if (!cached) {
    cached = new GeminiProvider();
  }
  return cached;
}

/** For tests that want a fresh instance after changing env. */
export function resetProvider(): void {
  cached = null;
}

// Public, provider-agnostic surface re-exported for callers (route, CLI, UI).
export type {
  AIProvider,
  GenerateParams,
  GeneratedMaterial,
  SummaryMaterial,
  Eli5Material,
  QuizMaterial,
  SummarySection,
  KeyFormula,
  Analogy,
  QuizQuestion,
  Difficulty,
  AIErrorCode,
  Mode,
} from "./types.ts";
export { AIProviderError, isMode, MODES } from "./types.ts";
