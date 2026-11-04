import { NextResponse } from "next/server";
import { AIProviderError } from "@/lib/ai/types";

export function fail(error: string, status: number, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

/** The response for an error thrown while generating or translating. */
export function failFromError(err: unknown, fallback: string) {
  if (err instanceof AIProviderError) return fail(err.userMessage, statusFor(err.code), err.code);
  return fail(fallback, 500);
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
