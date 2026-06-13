"use client";

import { useMemo, useState } from "react";
import type { FlashcardMaterial } from "@/lib/ai/types";
import { MathText } from "./MathText";
import { StudyCard } from "./StudyCard";

export function FlashcardsView({ data }: { data: FlashcardMaterial }) {
  const total = data.cards.length;

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

  if (done) {
    const wrong = order.filter((i) => verdicts[i] === false);
    const passed = order.length - wrong.length;
    return (
      <StudyCard title={data.title}>
        <div className="sb-fc-done">
          <div className="sb-fc-done-score">
            Ήξερες <strong>{passed}</strong> από <strong>{order.length}</strong>
          </div>
          <div className="sb-fc-done-actions">
            {wrong.length > 0 && (
              <button
                className="sb-btn sb-btn-primary"
                onClick={() => restart(wrong)}
              >
                Επανάληψη λαθών ({wrong.length})
              </button>
            )}
            <button
              className="sb-btn"
              onClick={() => restart(data.cards.map((_, i) => i))}
            >
              Από την αρχή
            </button>
            <button className="sb-btn" onClick={shuffle}>
              Ανακάτεψε
            </button>
          </div>
        </div>
      </StudyCard>
    );
  }

  return (
    <StudyCard title={data.title}>
      <div className="sb-fc-bar">
        <span>
          Κάρτα {pos + 1} / {order.length}
        </span>
        <span className="sb-fc-known">✓ {known}</span>
      </div>
      <div className="sb-fc-progress">
        <span style={{ width: `${(pos / order.length) * 100}%` }} />
      </div>

      <button
        type="button"
        className={"sb-fc-card" + (flipped ? " flipped" : "")}
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Δείξε την ερώτηση" : "Δείξε την απάντηση"}
      >
        <span className="sb-fc-side-label">
          {flipped ? "Απάντηση" : "Ερώτηση"}
          <span className="sb-diff">{card!.difficulty}</span>
        </span>
        <span className="sb-fc-content">
          <MathText text={flipped ? card!.back : card!.front} />
        </span>
        {!flipped && (
          <span className="sb-fc-hint">Πάτησε για την απάντηση</span>
        )}
      </button>

      <div className="sb-fc-actions">
        {flipped ? (
          <>
            <button className="sb-btn sb-fc-no" onClick={() => answer(false)}>
              Δεν το ήξερα
            </button>
            <button className="sb-btn sb-fc-yes" onClick={() => answer(true)}>
              Το ήξερα
            </button>
          </>
        ) : (
          <button
            className="sb-btn sb-btn-primary sb-fc-flip"
            onClick={() => setFlipped(true)}
          >
            Δείξε την απάντηση
          </button>
        )}
      </div>
    </StudyCard>
  );
}
