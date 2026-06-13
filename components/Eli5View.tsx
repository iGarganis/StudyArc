import type { Eli5Material } from "@/lib/ai/types";
import { MathText } from "./MathText";
import { StudyCard } from "./StudyCard";

export function Eli5View({ data }: { data: Eli5Material }) {
  return (
    <StudyCard title={data.title}>
      <p>
        <MathText text={data.explanation} />
      </p>

      {data.analogies.length > 0 && (
        <>
          <h3 className="sb-h3">Αναλογίες</h3>
          {data.analogies.map((a, i) => (
            <p key={i}>
              <strong>{a.concept}:</strong> <MathText text={a.analogy} />
            </p>
          ))}
        </>
      )}
    </StudyCard>
  );
}
