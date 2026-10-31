import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Difficulty } from "@/lib/ai/types";
import { DIFFICULTY_LABEL } from "@/lib/study";

/** Card shared by quiz questions and true/false statements. */
export function QuestionCard({
  number,
  difficulty,
  prompt,
  children,
}: {
  number: number;
  difficulty: Difficulty;
  prompt: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap sm:gap-3">
        <span className="shrink-0 text-base leading-6 font-semibold text-muted-foreground tabular-nums">
          {number}.
        </span>
        <p className="min-w-0 text-base leading-6 font-medium max-sm:order-last max-sm:basis-full sm:flex-1">
          {prompt}
        </p>
        <Badge variant="secondary" className="max-sm:ml-auto">
          {DIFFICULTY_LABEL[difficulty]}
        </Badge>
      </div>
      {children}
    </Card>
  );
}

export type AnswerState = "idle" | "correct" | "wrong" | "dim";

const STATE_CLASS: Record<AnswerState, string> = {
  idle: "cursor-pointer hover:bg-muted",
  correct: "border-foreground",
  wrong: "border-destructive",
  dim: "text-muted-foreground",
};

/** One selectable answer. Its result is always shown as icon + label, not color alone. */
export function AnswerButton({
  state,
  letter,
  tag,
  onClick,
  className = "",
  children,
}: {
  state: AnswerState;
  letter?: string;
  tag?: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  const marked = state === "correct" || state === "wrong";
  return (
    <button
      type="button"
      disabled={state === "dim"}
      aria-disabled={state !== "idle"}
      onClick={state === "idle" ? onClick : undefined}
      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-background px-3 py-2.5 text-left text-foreground max-sm:min-h-10 sm:flex-nowrap ${STATE_CLASS[state]} ${className}`}
    >
      {letter && (
        <span
          className={
            "inline-flex size-6 shrink-0 items-center justify-center rounded-sm border text-xs font-semibold " +
            (state === "correct"
              ? "border-foreground bg-foreground text-background"
              : state === "wrong"
                ? "border-destructive text-destructive"
                : "")
          }
        >
          {letter}
        </span>
      )}
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
      {marked && tag && (
        <span
          className={
            "ml-auto inline-flex max-w-full min-w-0 items-center gap-1 text-xs font-medium sm:shrink-0 [&_svg]:shrink-0 " +
            (state === "wrong" ? "text-destructive" : "")
          }
        >
          {state === "correct" ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <X className="size-4" aria-hidden />
          )}
          {tag}
        </span>
      )}
    </button>
  );
}

export function Explanation({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted px-4 py-3">
      {children}
    </div>
  );
}
