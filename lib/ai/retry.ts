import { AIProviderError } from "./types.ts";

export interface RetryOptions {
  /** Number of retries AFTER the first attempt (so attempts = retries + 1). */
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  onRetry?: (attempt: number, delayMs: number, err: AIProviderError) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying only on retryable {@link AIProviderError}s (transient 5xx,
 * rate limits, bad responses) with exponential backoff + full jitter.
 * Non-retryable errors (missing key, empty doc) propagate immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseMs = options.baseMs ?? 1000;
  const maxMs = options.maxMs ?? 8000;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof AIProviderError && err.retryable;
      if (!retryable || attempt >= retries) throw err;

      const window = Math.min(maxMs, baseMs * 2 ** attempt);
      // full jitter in the lower-to-upper half of the window
      const delay = Math.round(window / 2 + Math.random() * (window / 2));
      options.onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
      attempt++;
    }
  }
}
