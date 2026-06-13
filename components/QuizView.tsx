"use client";

import { useState } from "react";
import type { QuizMaterial } from "@/lib/ai/types";
import { MathText } from "./MathText";
import { StudyCard } from "./StudyCard";

/** Greek capital letter for an option index (0 → Α, 1 → Β, ...). */
const letter = (i: number) => String.fromCharCode(913 + i);

export function QuizView({ data }: { data: QuizMaterial }) {
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
        return (
          <div key={qi} className="sb-q">
            <div>
              <strong>{qi + 1}.</strong> <MathText text={q.question} />
              <span className="sb-diff">{q.difficulty}</span>
            </div>

            <div className="sb-opts">
              {q.options.map((opt, oi) => {
                const cls =
                  "sb-btn sb-opt" +
                  (locked && oi === q.correctIndex ? " correct" : "") +
                  (locked && oi === chosen && oi !== q.correctIndex ? " wrong" : "");
                return (
                  <button
                    key={oi}
                    className={cls}
                    disabled={locked}
                    onClick={() => pick(qi, oi)}
                  >
                    <span className="sb-letter">{letter(oi)}.</span>
                    <span>
                      <MathText text={opt} />
                    </span>
                  </button>
                );
              })}
            </div>

            {locked && (
              <div className="sb-exp">
                <MathText text={q.explanations[chosen] ?? ""} />
                {chosen !== q.correctIndex && (
                  <div className="sb-exp-correct">
                    Σωστή απάντηση ({letter(q.correctIndex)}):{" "}
                    <MathText text={q.explanations[q.correctIndex] ?? ""} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </StudyCard>
  );
}
