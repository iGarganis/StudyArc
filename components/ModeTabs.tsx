"use client";

import { Check, Download, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eli5View } from "@/components/Eli5View";
import { FlashcardsView } from "@/components/FlashcardsView";
import { MathText } from "@/components/MathText";
import { QuizView } from "@/components/QuizView";
import { SummaryView } from "@/components/SummaryView";
import { TrueFalseView } from "@/components/TrueFalseView";
import type { Mode } from "@/lib/ai/types";
import { exportMaterialToPdf } from "@/lib/exportPdf";
import { MODE_LIST, type Panels, type Result } from "@/lib/study";

// New generations are new objects; keying the views by identity gives each one
// fresh answers/progress, while switching tabs (same object) keeps them.
const materialIds = new WeakMap<object, number>();
let nextMaterialId = 0;
function materialKey(material: object): number {
  let id = materialIds.get(material);
  if (id === undefined) {
    id = ++nextMaterialId;
    materialIds.set(material, id);
  }
  return id;
}

function MaterialView({
  result,
  scoreSlot,
  showScore,
}: {
  result: Result;
  scoreSlot: HTMLElement | null;
  showScore: boolean;
}) {
  const material = result.material;
  switch (material.mode) {
    case "summary":
      return <SummaryView data={material} />;
    case "eli5":
      return <Eli5View data={material} />;
    case "quiz":
      return (
        <QuizView data={material} scoreSlot={scoreSlot} showScore={showScore} />
      );
    case "truefalse":
      return (
        <TrueFalseView
          data={material}
          scoreSlot={scoreSlot}
          showScore={showScore}
        />
      );
    case "flashcards":
      return <FlashcardsView data={material} />;
  }
}

export function ModeTabs({
  panels,
  hasFile,
  loadingMode,
  activeTab,
  scoreSlot,
  onTabChange,
  onGenerate,
  onRemove,
}: {
  panels: Panels;
  hasFile: boolean;
  loadingMode: Mode | null;
  activeTab: Mode;
  scoreSlot: HTMLElement | null;
  onTabChange: (mode: Mode) => void;
  onGenerate: (mode: Mode) => void;
  onRemove: (mode: Mode) => void;
}) {
  const busy = loadingMode !== null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as Mode)}
      className="gap-5 sm:gap-6"
    >
      <TabsList aria-label="Μορφές υλικού">
        {MODE_LIST.map((m) => (
          <TabsTrigger key={m.id} value={m.id}>
            {m.label}
            {loadingMode === m.id ? (
              <span aria-label="σε δημιουργία">…</span>
            ) : (
              panels[m.id] && <Check role="img" aria-label="έτοιμο" />
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {MODE_LIST.map((m) => {
        const result = panels[m.id];
        const loading = loadingMode === m.id;
        const isActive = activeTab === m.id;
        return (
          // forceMount keeps answers and progress alive across tab switches.
          <TabsContent
            key={m.id}
            value={m.id}
            forceMount
            className="data-[state=inactive]:hidden"
          >
            {loading && (
              <Card className="p-6">
                <p role="status" className="text-base leading-6 font-medium">
                  Δημιουργία υλικού. Μπορεί να διαρκέσει έως 2 λεπτά.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Στο μεταξύ μπορείτε να δείτε τα υπόλοιπα tabs.
                </p>
              </Card>
            )}

            {result && (
              <section className={loading ? "hidden" : "flex flex-col gap-4"}>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4">
                  <div className="flex min-w-0 flex-col gap-1 sm:flex-[1_1_320px]">
                    <h2 className="text-xl font-semibold tracking-[-0.01em]">
                      <MathText text={result.material.title} />
                    </h2>
                    <p className="truncate text-muted-foreground">
                      {result.fileName}
                      {result.meta?.totalPages
                        ? ` · ${result.meta.totalPages} σελ.`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        exportMaterialToPdf(result.material, result.fileName)
                      }
                    >
                      <Download />
                      Λήψη PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Αναδημιουργία"
                      title="Αναδημιουργία"
                      disabled={busy || !hasFile}
                      onClick={() => onGenerate(m.id)}
                      className="max-md:w-8 max-md:px-0 max-sm:w-10"
                    >
                      <RefreshCw />
                      <span className="max-md:hidden">Αναδημιουργία</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Αφαίρεση"
                      title="Αφαίρεση"
                      onClick={() => onRemove(m.id)}
                      className="max-md:w-8 max-md:px-0 max-sm:w-10"
                    >
                      <X />
                      <span className="max-md:hidden">Αφαίρεση</span>
                    </Button>
                  </div>
                </div>
                <MaterialView
                  key={materialKey(result.material)}
                  result={result}
                  scoreSlot={scoreSlot}
                  showScore={isActive && !loading}
                />
              </section>
            )}

            {!result && !loading && (
              <Card className="flex flex-col items-start gap-4 p-6">
                <p className="text-muted-foreground">{m.blurb}</p>
                {hasFile ? (
                  <Button disabled={busy} onClick={() => onGenerate(m.id)}>
                    Δημιουργία
                  </Button>
                ) : (
                  <p>
                    Για να δημιουργηθεί αυτή η μορφή, ανεβάστε ξανά το PDF.
                  </p>
                )}
              </Card>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
