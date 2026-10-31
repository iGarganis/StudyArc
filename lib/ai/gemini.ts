import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { AIProviderError } from "./types.ts";
import type {
  AIProvider,
  GenerateParams,
  GeneratedMaterial,
  GenerationResult,
  Mode,
} from "./types.ts";
import { buildPrompt } from "./prompts.ts";
import {
  parseSummary,
  parseEli5,
  parseQuiz,
  parseTrueFalse,
  parseFlashcards,
} from "./validate.ts";
import { withRetry } from "./retry.ts";

const DEFAULT_MODEL = "gemini-2.5-flash";

// JSON schemas per mode (Gemini-specific; stay inside lib/ai).
const SUMMARY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING },
          content: { type: Type.STRING },
          keyFormulas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                latex: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ["latex", "explanation"],
              propertyOrdering: ["latex", "explanation"],
            },
          },
        },
        required: ["heading", "content", "keyFormulas"],
        propertyOrdering: ["heading", "content", "keyFormulas"],
      },
    },
    examTips: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["title", "sections", "examTips"],
  propertyOrdering: ["title", "sections", "examTips"],
};

const ELI5_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    explanation: { type: Type.STRING },
    analogies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING },
          analogy: { type: Type.STRING },
        },
        required: ["concept", "analogy"],
        propertyOrdering: ["concept", "analogy"],
      },
    },
  },
  required: ["title", "explanation", "analogies"],
  propertyOrdering: ["title", "explanation", "analogies"],
};

const QUIZ_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctIndex: { type: Type.INTEGER },
          explanations: { type: Type.ARRAY, items: { type: Type.STRING } },
          difficulty: { type: Type.STRING },
        },
        required: [
          "question",
          "options",
          "correctIndex",
          "explanations",
          "difficulty",
        ],
        propertyOrdering: [
          "question",
          "options",
          "correctIndex",
          "explanations",
          "difficulty",
        ],
      },
    },
  },
  required: ["title", "questions"],
  propertyOrdering: ["title", "questions"],
};

const TRUEFALSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          statement: { type: Type.STRING },
          answer: { type: Type.BOOLEAN },
          explanation: { type: Type.STRING },
          difficulty: { type: Type.STRING },
        },
        required: ["statement", "answer", "explanation", "difficulty"],
        propertyOrdering: ["statement", "answer", "explanation", "difficulty"],
      },
    },
  },
  required: ["title", "questions"],
  propertyOrdering: ["title", "questions"],
};

const FLASHCARDS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    cards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING },
          back: { type: Type.STRING },
          difficulty: { type: Type.STRING },
        },
        required: ["front", "back", "difficulty"],
        propertyOrdering: ["front", "back", "difficulty"],
      },
    },
  },
  required: ["title", "cards"],
  propertyOrdering: ["title", "cards"],
};

const SCHEMAS: Record<Mode, Schema> = {
  summary: SUMMARY_SCHEMA,
  eli5: ELI5_SCHEMA,
  quiz: QUIZ_SCHEMA,
  truefalse: TRUEFALSE_SCHEMA,
  flashcards: FLASHCARDS_SCHEMA,
};

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "MISSING_API_KEY",
        "The Gemini API key is missing. Copy .env.local.example to .env.local and fill in GEMINI_API_KEY.",
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  }

  generateMaterial(params: GenerateParams): Promise<GenerationResult> {
    if (!params.documentText?.trim()) {
      throw new AIProviderError(
        "EMPTY_DOCUMENT",
        "There is no text to process.",
      );
    }
    return withRetry(() => this.generateOnce(params), { onRetry: logRetry });
  }

  /** A single end-to-end attempt: model call + parse/validate. */
  private async generateOnce(
    params: GenerateParams,
  ): Promise<GenerationResult> {
    const { data, usageTokens } = await this.callModel(
      SCHEMAS[params.mode],
      params,
    );
    let material: GeneratedMaterial;
    switch (params.mode) {
      case "summary":
        material = parseSummary(data);
        break;
      case "eli5":
        material = parseEli5(data);
        break;
      case "quiz":
        material = parseQuiz(data);
        break;
      case "truefalse":
        material = parseTrueFalse(data);
        break;
      case "flashcards":
        material = parseFlashcards(data);
        break;
      default:
        throw new AIProviderError("PROVIDER_ERROR", "Unknown mode.");
    }
    return { material, usageTokens };
  }

  /**
   * One Gemini call in JSON mode. Returns the parsed-but-unvalidated JSON plus
   * the total tokens the call billed (prompt + output + thinking).
   */
  private async callModel(
    schema: Schema,
    params: GenerateParams,
  ): Promise<{ data: unknown; usageTokens: number }> {
    const { system, user } = buildPrompt(params.mode, params);

    let text: string | undefined;
    let usageTokens = 0;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.4,
          // Generous cap: gemini-2.5-flash is a thinking model, so the budget
          // must cover both reasoning AND a large payload (e.g. a 20-question
          // quiz with 4 options + 4 explanations each, or a long-doc summary).
          maxOutputTokens: 32768,
        },
      });
      text = response.text;
      usageTokens = response.usageMetadata?.totalTokenCount ?? 0;
    } catch (err) {
      throw toAIProviderError(err);
    }

    if (!text) {
      throw new AIProviderError(
        "INVALID_RESPONSE",
        "The model returned no result. Try again.",
        { retryable: true },
      );
    }

    try {
      return { data: JSON.parse(text), usageTokens };
    } catch (err) {
      throw new AIProviderError(
        "INVALID_RESPONSE",
        "The model returned an invalid response. Try again.",
        { retryable: true, cause: err },
      );
    }
  }
}

function logRetry(attempt: number, delayMs: number, err: AIProviderError): void {
  console.error(`[gemini] transient ${err.code}; retry ${attempt} in ${delayMs}ms`);
}

/** Map an unknown SDK/network error to a typed AIProviderError. */
export function toAIProviderError(err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err;

  const status = readStatus(err);
  const message = err instanceof Error ? err.message : String(err);

  if (status === 429 || /quota|rate.?limit|resource_exhausted/i.test(message)) {
    // Daily/hard quota (or no free-tier allowance) → don't retry, tell the user.
    if (/per.?day|requests?.?per.?day|limit:\s*0|billing|plan and billing/i.test(message)) {
      return new AIProviderError(
        "QUOTA_EXHAUSTED",
        "Gemini's daily free request limit is used up (or this model has no available quota). Try again later or check your plan and key.",
        { retryable: false, cause: err },
      );
    }
    // Per-minute rate limit → transient, retry with backoff.
    return new AIProviderError(
      "RATE_LIMITED",
      "Gemini's per-minute request limit was exceeded. Wait a moment and try again.",
      { retryable: true, cause: err },
    );
  }
  if (
    status === 401 ||
    status === 403 ||
    /api.?key|permission|unauthenticated|invalid.*key/i.test(message)
  ) {
    return new AIProviderError(
      "MISSING_API_KEY",
      "There is a problem with the Gemini API key. Check GEMINI_API_KEY in .env.local.",
      { cause: err },
    );
  }
  if (
    status === 500 ||
    status === 503 ||
    status === 504 ||
    /unavailable|overload|high demand|internal error|try again/i.test(message)
  ) {
    return new AIProviderError(
      "PROVIDER_ERROR",
      "Gemini is temporarily overloaded. Try again shortly.",
      { retryable: true, cause: err },
    );
  }
  return new AIProviderError(
    "PROVIDER_ERROR",
    "Could not reach Gemini. Try again shortly.",
    { retryable: true, cause: err },
  );
}

function readStatus(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.code === "number") return e.code;
  }
  return undefined;
}
