import { NextResponse, type NextRequest } from "next/server";
import { translateStudyMaterial } from "@/lib/ai/generate";
import { isLanguage, isMode, type GeneratedMaterial } from "@/lib/ai/types";
import { parseMaterial } from "@/lib/ai/validate";
import { fail, failFromError } from "@/lib/apiResponses";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Material is about 30 KB; anything far bigger isn't from this app. */
const MAX_MATERIAL_BYTES = 300_000;

/** Translates material the app generated into English or Greek. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.", 400);
  }

  const { material: raw, target } = body ?? {};
  if (!isLanguage(target)) return fail("Unknown language.", 400, "BAD_LANGUAGE");
  if (Buffer.byteLength(JSON.stringify(raw ?? null)) > MAX_MATERIAL_BYTES)
    return fail("The material is too large.", 413, "TOO_LARGE");

  // The client sends the material back, so check it like model output.
  const mode = (raw as { mode?: unknown } | null)?.mode;
  if (!isMode(mode)) return fail("Unknown material.", 400, "BAD_MATERIAL");
  let material: GeneratedMaterial;
  try {
    material = parseMaterial(mode, raw);
  } catch {
    return fail("The material is not valid.", 400, "BAD_MATERIAL");
  }

  try {
    const result = await translateStudyMaterial({ material, target });
    return NextResponse.json({
      material: result.material,
      source: result.source,
      usage: { totalTokens: result.usageTokens },
    });
  } catch (err) {
    return failFromError(err, "Unexpected error while translating material.");
  }
}
