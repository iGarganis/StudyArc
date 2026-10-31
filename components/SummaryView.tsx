import { Fragment } from "react";
import type { SummaryMaterial } from "@/lib/ai/types";
import { Separator } from "@/components/ui/separator";
import { MathText } from "./MathText";

export function SummaryView({ data }: { data: SummaryMaterial }) {
  return (
    <div className="flex flex-col">
      <Separator />
      {data.sections.map((s, i) => (
        <Fragment key={i}>
          <section className="flex flex-col gap-3 py-6 text-base">
            <h3 className="text-base leading-6 font-semibold">
              <MathText text={s.heading} />
            </h3>
            <p>
              <MathText text={s.content} />
            </p>
            {s.keyFormulas.map((f, j) => (
              <div key={j} className="flex flex-col gap-1.5">
                <div className="overflow-x-auto rounded-md bg-muted p-4 text-[18px] leading-7">
                  <MathText text={`$$${f.latex}$$`} />
                </div>
                <p className="text-sm text-muted-foreground">
                  <MathText text={f.explanation} />
                </p>
              </div>
            ))}
          </section>
          {(i < data.sections.length - 1 || data.examTips.length > 0) && (
            <Separator />
          )}
        </Fragment>
      ))}

      {data.examTips.length > 0 && (
        <section className="flex flex-col gap-3 pt-6 text-base">
          <h3 className="text-base leading-6 font-semibold">
            Exam tips
          </h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {data.examTips.map((t, i) => (
              <li key={i}>
                <MathText text={t} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
