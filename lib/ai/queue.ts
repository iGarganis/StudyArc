/**
 * Serializes async tasks so only one runs at a time. Generations go through a
 * shared queue, which keeps us comfortably under Gemini's free-tier rate limit
 * (sequential ~15s calls ≈ 4 req/min, well under 15 req/min) and avoids bursts.
 */
export class AsyncQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    // Run `task` once the previous one settles (success OR failure).
    const result = this.tail.then(task, task);
    // Advance the chain on a rejection-proof tail so one failure can't wedge it.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/** Process-wide queue shared by all generations. */
export const generationQueue = new AsyncQueue();
