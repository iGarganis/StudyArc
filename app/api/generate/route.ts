import { NextResponse, type NextRequest } from "next/server";
import { generateStudyMaterial } from "@/lib/ai/generate";
import { AIProviderError, isMode } from "@/lib/ai/types";
import { MAX_TEXT_BYTES, MIN_TEXT_CHARS } from "@/lib/limits";

// The Gemini SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Headroom for queueing + retry/backoff on transient Gemini errors.
export const maxDuration = 120;

/** Takes the document's text: the browser reads the PDF, see lib/limits.ts. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.", 400);
  }

  const { mode, text, courseContext, regenerate } = body ?? {};

  if (!isMode(mode)) return fail("Unknown mode.", 400, "BAD_MODE");
  if (typeof text !== "string") return fail("No document text was provided.", 400, "NO_TEXT");
  if (Buffer.byteLength(text) > MAX_TEXT_BYTES)
    return fail("The document has too much text.", 413, "TEXT_TOO_LARGE");
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS)
    return fail("The document has no usable text.", 422, "NO_TEXT");

  try {
    const { material, usageTokens, source } = await generateStudyMaterial(
      {
        documentText: text,
        mode,
        courseContext: typeof courseContext === "string" ? courseContext : undefined,
        covered: parseCovered(body.covered),
      },
      { refresh: regenerate === true },
    );
    return NextResponse.json({
      material,
      source,
      usage: { totalTokens: usageTokens },
    });
  } catch (err) {
    if (err instanceof AIProviderError)
      return fail(err.userMessage, statusFor(err.code), err.code);
    return fail("Unexpected error while generating material.", 500);
  }
}

/** Keep only the usable items of the optional cross-mode coverage list. */
function parseCovered(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function fail(error: string, status: number, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

function statusFor(code: string): number {
  switch (code) {
    case "MISSING_API_KEY":
      return 500;
    case "RATE_LIMITED":
    case "QUOTA_EXHAUSTED":
      return 429;
    case "INVALID_RESPONSE":
    case "PROVIDER_ERROR":
      return 502;
    default:
      return 500;
  }
}
