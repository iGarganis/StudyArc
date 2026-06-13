import type { SummaryMaterial } from "@/lib/ai/types";
import { MathText } from "./MathText";
import { StudyCard } from "./StudyCard";

export function SummaryView({ data }: { data: SummaryMaterial }) {
  return (
    <StudyCard title={data.title}>
      {data.sections.map((s, i) => (
        <section key={i}>
          <h3 className="sb-h3">{s.heading}</h3>
          <p>
            <MathText text={s.content} />
          </p>
          {s.keyFormulas.map((f, j) => (
            <div key={j} className="sb-formula">
              <MathText text={`$$${f.latex}$$`} />
              <span className="sb-formula-exp">{f.explanation}</span>
            </div>
          ))}
        </section>
      ))}

      {data.examTips.length > 0 && (
        <section>
          <h3 className="sb-h3">Συμβουλές για την εξέταση</h3>
          <ul className="sb-tips">
            {data.examTips.map((t, i) => (
              <li key={i}>
                <MathText text={t} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </StudyCard>
  );
}
