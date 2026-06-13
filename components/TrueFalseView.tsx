"use client";

import { useState } from "react";
import type { TrueFalseMaterial } from "@/lib/ai/types";
import { MathText } from "./MathText";
import { StudyCard } from "./StudyCard";

export function TrueFalseView({ data }: { data: TrueFalseMaterial }) {
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
    <StudyCard title={data.title}>
      <div className="sb-score">
        Σκορ: {score} / {data.questions.length}
        {answered === data.questions.length
          ? " — ολοκληρώθηκε ✓"
          : ` (${answered} απαντημένες)`}
      </div>

      {data.questions.map((q, qi) => {
        const chosen = answers[qi];
        const locked = chosen !== null;
        const correct = locked && chosen === q.answer;
        return (
          <div key={qi} className="sb-q">
            <div>
              <strong>{qi + 1}.</strong> <MathText text={q.statement} />
              <span className="sb-diff">{q.difficulty}</span>
            </div>

            <div className="sb-modes" style={{ marginTop: 10 }}>
              {([true, false] as const).map((value) => {
                const label = value ? "Σωστό" : "Λάθος";
                const isAnswer = q.answer === value;
                const isChosen = chosen === value;
                const cls =
                  "sb-btn sb-tf" +
                  (locked && isAnswer ? " correct" : "") +
                  (locked && isChosen && !isAnswer ? " wrong" : "");
                return (
                  <button
                    key={label}
                    className={cls}
                    disabled={locked}
                    onClick={() => pick(qi, value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {locked && (
              <div className="sb-exp">
                <strong>{correct ? "Σωστά ✓" : "Λάθος ✗"}</strong> — η δήλωση
                είναι {q.answer ? "Σωστή" : "Λάθος"}.{" "}
                <MathText text={q.explanation} />
              </div>
            )}
          </div>
        );
      })}
    </StudyCard>
  );
}
