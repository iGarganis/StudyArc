import type { Eli5Material } from "@/lib/ai/types";
import { Separator } from "@/components/ui/separator";
import { MathText } from "./MathText";

export function Eli5View({ data }: { data: Eli5Material }) {
  return (
    <div className="flex flex-col">
      <Separator />
      <p className="py-6 text-base">
        <MathText text={data.explanation} />
      </p>

      {data.analogies.length > 0 && (
        <>
          <Separator />
          <section className="flex flex-col gap-3 pt-6 text-base">
            <h3 className="text-base leading-6 font-semibold">Αναλογίες</h3>
            {data.analogies.map((a, i) => (
              <p key={i}>
                <span className="font-medium">
                  <MathText text={a.concept} />:
                </span>{" "}
                <MathText text={a.analogy} />
              </p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
