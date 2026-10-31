"use client";

import { createPortal } from "react-dom";
import { Progress } from "@/components/ui/progress";

/**
 * The full-width score line pinned under the top bar. It's portalled out of the
 * tab panel into a page-level sticky slot, so it stays visible while scrolling
 * through the whole quiz.
 */
export function ScoreBar({
  slot,
  show,
  score,
  answered,
  total,
  progressLabel,
}: {
  slot: HTMLElement | null;
  show: boolean;
  score: number;
  answered: number;
  total: number;
  progressLabel: string;
}) {
  if (!slot || !show) return null;
  return createPortal(
    <div className="border-b bg-background px-4 py-2.5 sm:px-6 sm:py-3">
      <div className="mx-auto flex w-full max-w-[768px] flex-col gap-2">
        <p aria-live="polite" className="font-medium tabular-nums">
          Score: {score} / {total} ·{" "}
          {answered === total ? "Completed" : `${answered} answered`}
        </p>
        <Progress aria-label={progressLabel} value={answered} max={total} />
      </div>
    </div>,
    slot,
  );
}
