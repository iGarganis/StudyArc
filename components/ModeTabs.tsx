"use client";

import { Check, Database, Download, Languages, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eli5View } from "@/components/Eli5View";
import { FlashcardsView } from "@/components/FlashcardsView";
import { MathText } from "@/components/MathText";
import { QuizView } from "@/components/QuizView";
import { SummaryView } from "@/components/SummaryView";
import { TrueFalseView } from "@/components/TrueFalseView";
import type { Language, Mode } from "@/lib/ai/types";
import { exportMaterialToPdf } from "@/lib/exportPdf";
import {
  LANGUAGE_LABEL,
  MODE_LIST,
  translationTargets,
  type Panels,
  type Result,
} from "@/lib/study";

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
  loadingText,
  activeTab,
  scoreSlot,
  onTabChange,
  onGenerate,
  onRemove,
  onTranslate,
  onShowOriginal,
}: {
  panels: Panels;
  hasFile: boolean;
  loadingMode: Mode | null;
  loadingText: string;
  activeTab: Mode;
  scoreSlot: HTMLElement | null;
  onTabChange: (mode: Mode) => void;
  onGenerate: (mode: Mode) => void;
  onRemove: (mode: Mode) => void;
  onTranslate: (mode: Mode, target: Language) => void;
  onShowOriginal: (mode: Mode) => void;
}) {
  const busy = loadingMode !== null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as Mode)}
      className="gap-5 sm:gap-6"
    >
      <TabsList aria-label="Material formats">
        {MODE_LIST.map((m) => (
          <TabsTrigger key={m.id} value={m.id}>
            {m.label}
            {loadingMode === m.id ? (
              <span aria-label="generating">…</span>
            ) : (
              panels[m.id] && <Check role="img" aria-label="ready" />
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
                  {loadingText}
                </p>
                <p className="mt-1 text-muted-foreground">
                  You can browse the other tabs in the meantime.
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
                    {(result.source === "database" || result.source === "memory") && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Database className="size-3.5 shrink-0" aria-hidden />
                        Loaded from{" "}
                        {result.source === "database" ? "the database" : "server memory"}
                        , no Gemini request used
                      </p>
                    )}
                    {result.translatedTo && (
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <Languages className="size-3.5 shrink-0" aria-hidden />
                        Translated to {LANGUAGE_LABEL[result.translatedTo]} ·
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onShowOriginal(m.id)}
                          className="cursor-pointer rounded-sm font-medium text-foreground underline underline-offset-4 disabled:opacity-50 max-sm:py-2.5"
                        >
                          Show original
                        </button>
                      </p>
                    )}
                    <p className="truncate text-muted-foreground">
                      {result.fileName}
                      {result.meta?.totalPages
                        ? ` · ${result.meta.totalPages} ${result.meta.totalPages === 1 ? "page" : "pages"}`
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
                      Download PDF
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Translate"
                          title="Translate"
                          disabled={busy || translationTargets(result).length === 0}
                          className="max-md:w-8 max-md:px-0 max-sm:w-10"
                        >
                          <Languages />
                          <span className="max-md:hidden">Translate</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-auto min-w-36">
                        {translationTargets(result).map((target) => (
                          <DropdownMenuItem
                            key={target}
                            onSelect={() => onTranslate(m.id, target)}
                            className="cursor-pointer px-2 py-1.5 max-sm:py-2.5"
                          >
                            {LANGUAGE_LABEL[target]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Regenerate"
                      title="Regenerate"
                      disabled={busy || !hasFile}
                      onClick={() => onGenerate(m.id)}
                      className="max-md:w-8 max-md:px-0 max-sm:w-10"
                    >
                      <RefreshCw />
                      <span className="max-md:hidden">Regenerate</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove"
                      title="Remove"
                      onClick={() => onRemove(m.id)}
                      className="max-md:w-8 max-md:px-0 max-sm:w-10"
                    >
                      <X />
                      <span className="max-md:hidden">Remove</span>
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
                    Generate
                  </Button>
                ) : (
                  <p>
                    To generate this format, upload a PDF.
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
