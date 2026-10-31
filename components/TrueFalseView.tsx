"use client";

import { useState } from "react";
import type { TrueFalseMaterial } from "@/lib/ai/types";
import { MathText } from "./MathText";
import { AnswerButton, Explanation, QuestionCard, type AnswerState } from "./QuestionParts";
import { ScoreBar } from "./ScoreBar";

export function TrueFalseView({
  data,
  scoreSlot,
  showScore,
}: {
  data: TrueFalseMaterial;
  scoreSlot: HTMLElement | null;
  showScore: boolean;
}) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() =>
    data.questions.map(() => null),
  );

  const answered = answers.filter((a) => a !== null).length;
  const score = data.questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.answer ? 1 : 0),
    0,
  );

  const pick = (qi: number, value: boolean) =>
    setAnswers((prev) =>
      prev[qi] !== null ? prev : prev.map((a, i) => (i === qi ? value : a)),
    );

  return (
    <div className="flex flex-col gap-4">
      <ScoreBar
        slot={scoreSlot}
        show={showScore}
        score={score}
        answered={answered}
        total={data.questions.length}
        progressLabel="Απαντημένες δηλώσεις"
      />

      {data.questions.map((q, qi) => {
        const chosen = answers[qi];
        const locked = chosen !== null;
        const correct = locked && chosen === q.answer;
        return (
          <QuestionCard
            key={qi}
            number={qi + 1}
            difficulty={q.difficulty}
            prompt={<MathText text={q.statement} />}
          >
            <div
              role="group"
              aria-label={`Απάντηση δήλωσης ${qi + 1}`}
              className="grid grid-cols-2 gap-2"
            >
              {([true, false] as const).map((value) => {
                const isAnswer = q.answer === value;
                const isChosen = chosen === value;
                let state: AnswerState = "idle";
                if (locked) {
                  if (isAnswer) state = "correct";
                  else if (isChosen) state = "wrong";
                  else state = "dim";
                }
                return (
                  <AnswerButton
                    key={String(value)}
                    state={state}
                    tag={
                      state === "wrong"
                        ? "Η απάντησή σας"
                        : isChosen
                          ? "Σωστή · Η απάντησή σας"
                          : "Σωστή"
                    }
                    onClick={() => pick(qi, value)}
                    className="font-medium"
                  >
                    {value ? "Σωστό" : "Λάθος"}
                  </AnswerButton>
                );
              })}
            </div>

            {locked && (
              <Explanation>
                <p className="font-semibold">
                  {correct ? "Απαντήσατε σωστά." : "Η απάντησή σας ήταν λάθος."}{" "}
                  Η δήλωση είναι {q.answer ? "σωστή" : "λάθος"}.
                </p>
                <p>
                  <MathText text={q.explanation} />
                </p>
              </Explanation>
            )}
          </QuestionCard>
        );
      })}
    </div>
  );
}
