"use client";

import { useMemo, useState } from "react";
import type { FlashcardMaterial } from "@/lib/ai/types";
import { DIFFICULTY_LABEL } from "@/lib/study";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MathText } from "./MathText";

export function FlashcardsView({ data }: { data: FlashcardMaterial }) {
  // The deck currently being studied (indices into data.cards).
  const [order, setOrder] = useState<number[]>(() =>
    data.cards.map((_, i) => i),
  );
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // card index → did the student know it on this pass?
  const [verdicts, setVerdicts] = useState<Record<number, boolean>>({});

  const known = useMemo(
    () => Object.values(verdicts).filter(Boolean).length,
    [verdicts],
  );

  const done = pos >= order.length;
  const card = done ? null : data.cards[order[pos]];

  const answer = (knew: boolean) => {
    setVerdicts((prev) => ({ ...prev, [order[pos]]: knew }));
    setFlipped(false);
    setPos((p) => p + 1);
  };

  const restart = (indices: number[]) => {
    setOrder(indices);
    setVerdicts({});
    setPos(0);
    setFlipped(false);
  };

  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    restart(next);
  };

  const shownPos = Math.min(pos + 1, order.length);

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between font-medium tabular-nums">
        <span>
          Card {shownPos} / {order.length}
        </span>
        <span>Known: {known}</span>
      </div>
      <Progress
        aria-label="Card progress"
        value={shownPos}
        max={order.length}
      />
    </div>
  );

  if (done) {
    const wrong = order.filter((i) => verdicts[i] === false);
    const passed = order.length - wrong.length;
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Card className="flex min-h-60 flex-col justify-center gap-4 p-6">
          <div className="flex flex-col gap-1">
            <p role="status" className="text-xl font-semibold tabular-nums">
              You knew {passed} of {order.length}
            </p>
            <p className="text-muted-foreground">
              {wrong.length > 0
                ? "You can repeat only the cards you missed, or start over."
                : "You can start over or shuffle the deck."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {wrong.length > 0 && (
              <Button onClick={() => restart(wrong)}>
                Repeat missed ({wrong.length})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => restart(data.cards.map((_, i) => i))}
            >
              Start over
            </Button>
            <Button variant="outline" onClick={shuffle}>
              Shuffle
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={`Card, ${flipped ? "answer" : "question"} side. Press to flip.`}
          className={
            "flex min-h-60 w-full cursor-pointer flex-col gap-4 rounded-lg border px-5 pt-4 pb-6 text-center " +
            (flipped ? "bg-muted" : "bg-card")
          }
        >
          <span className="flex w-full items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {flipped ? "Answer" : "Question"}
            </span>
            <Badge
              variant="secondary"
              className={flipped ? "bg-background" : ""}
            >
              {DIFFICULTY_LABEL[card!.difficulty]}
            </Badge>
          </span>
          <span className="flex w-full min-w-0 flex-1 items-center justify-center px-2 text-xl leading-[30px] font-medium">
            {/* Display formulas follow the card's centered text here. */}
            <span className="min-w-0 [overflow-wrap:anywhere] [&_.katex-display>.katex]:text-center!">

              <MathText text={flipped ? card!.back : card!.front} />
            </span>
          </span>
        </button>

        {flipped ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => answer(false)}>
              I didn&apos;t know it
            </Button>
            <Button onClick={() => answer(true)}>I knew it</Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setFlipped(true)}>
            Show answer
          </Button>
        )}
      </div>
    </div>
  );
}
