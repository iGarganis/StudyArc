import { NextResponse, type NextRequest } from "next/server";
import { extractPdfText, PdfExtractionError, type ExtractedPdf } from "@/lib/pdf";
import { generateStudyMaterial } from "@/lib/ai/generate";
import { AIProviderError, isMode } from "@/lib/ai/types";

// PDF parsing + the Gemini SDK need the Node.js runtime (not Edge).
export const runtime = "nodejs";
// Headroom for queueing + retry/backoff on transient Gemini errors.
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Invalid request.", 400);
  }

  const mode = form.get("mode");
  const file = form.get("file");
  const courseContext = form.get("courseContext");
  const covered = parseCovered(form.get("covered"));

  if (!isMode(mode)) return fail("Unknown mode.", 400, "BAD_MODE");
  if (!(file instanceof File)) return fail("No PDF file was provided.", 400, "NO_FILE");
  if (file.size === 0) return fail("The file is empty.", 400, "EMPTY_FILE");
  if (file.size > MAX_BYTES)
    return fail("The file is larger than 20 MB.", 413, "TOO_LARGE");

  // 1) Extract text from the PDF.
  let extracted: ExtractedPdf;
  try {
    extracted = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof PdfExtractionError) return fail(err.userMessage, 422, err.code);
    return fail("Could not read the PDF.", 500);
  }

  // 2) Generate study material (cache → queue → chunking → provider).
  try {
    const { material, usageTokens } = await generateStudyMaterial({
      documentText: extracted.text,
      mode,
      courseContext:
        typeof courseContext === "string" ? courseContext : undefined,
      covered,
    });
    return NextResponse.json({
      material,
      meta: {
        totalPages: extracted.totalPages,
        charCount: extracted.charCount,
        title: extracted.meta.title ?? null,
      },
      usage: { totalTokens: usageTokens },
    });
  } catch (err) {
    if (err instanceof AIProviderError)
      return fail(err.userMessage, statusFor(err.code), err.code);
    return fail("Unexpected error while generating material.", 500);
  }
}

/** Parse the optional cross-mode coverage list (JSON array of strings). */
function parseCovered(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const arr = JSON.parse(value);
    if (!Array.isArray(arr)) return undefined;
    const items = arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
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
