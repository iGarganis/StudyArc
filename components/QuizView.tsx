"use client";

import { useState } from "react";
import type { QuizMaterial } from "@/lib/ai/types";
import { optionLetter } from "@/lib/study";
import { MathText } from "./MathText";
import { AnswerButton, Explanation, QuestionCard, type AnswerState } from "./QuestionParts";
import { ScoreBar } from "./ScoreBar";

export function QuizView({
  data,
  scoreSlot,
  showScore,
}: {
  data: QuizMaterial;
  scoreSlot: HTMLElement | null;
  showScore: boolean;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    data.questions.map(() => null),
  );

  const answered = answers.filter((a) => a !== null).length;
  const score = data.questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
    0,
  );

  const pick = (qi: number, oi: number) =>
    setAnswers((prev) =>
      prev[qi] !== null ? prev : prev.map((a, i) => (i === qi ? oi : a)),
    );

  return (
    <div className="flex flex-col gap-4">
      <ScoreBar
        slot={scoreSlot}
        show={showScore}
        score={score}
        answered={answered}
        total={data.questions.length}
        progressLabel="Answered questions"
      />

      {data.questions.map((q, qi) => {
        const chosen = answers[qi];
        const locked = chosen !== null;
        return (
          <QuestionCard
            key={qi}
            number={qi + 1}
            difficulty={q.difficulty}
            prompt={<MathText text={q.question} />}
          >
            <div
              role="group"
              aria-label={`Question ${qi + 1} options`}
              className="flex flex-col gap-2"
            >
              {q.options.map((opt, oi) => {
                let state: AnswerState = "idle";
                if (locked) {
                  if (oi === q.correctIndex) state = "correct";
                  else if (oi === chosen) state = "wrong";
                  else state = "dim";
                }
                return (
                  <AnswerButton
                    key={oi}
                    state={state}
                    letter={optionLetter(oi)}
                    tag={state === "correct" ? "Correct" : "Your answer"}
                    onClick={() => pick(qi, oi)}
                  >
                    <MathText text={opt} />
                  </AnswerButton>
                );
              })}
            </div>

            {locked && (
              <Explanation>
                <p>
                  <MathText text={q.explanations[chosen] ?? ""} />
                </p>
                {chosen !== q.correctIndex && (
                  <p>
                    <b className="font-semibold">
                      Correct answer ({optionLetter(q.correctIndex)}):
                    </b>{" "}
                    <MathText text={q.explanations[q.correctIndex] ?? ""} />
                  </p>
                )}
              </Explanation>
            )}
          </QuestionCard>
        );
      })}
    </div>
  );
}
