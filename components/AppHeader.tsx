"use client";

import type { RefObject } from "react";
import { History, Moon, Plus, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { USAGE_HINT, usageLabel, type Usage } from "@/lib/study";

export function AppHeader({
  usage,
  historyButtonRef,
  onBrand,
  onHistory,
  onToggleTheme,
  onNewStudy,
}: {
  usage: Usage;
  historyButtonRef: RefObject<HTMLButtonElement | null>;
  onBrand: () => void;
  onHistory: () => void;
  onToggleTheme: () => void;
  onNewStudy: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 h-14 border-b bg-background px-3 sm:px-6">
      <div className="mx-auto flex h-full w-full max-w-[768px] items-center gap-1">
        <button
          type="button"
          onClick={onBrand}
          className="mr-auto cursor-pointer rounded-sm pl-1 text-sm font-semibold sm:pl-0"
        >
          StudyArc
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mr-2 rounded-sm p-1 text-xs text-muted-foreground tabular-nums max-sm:hidden"
            >
              {usageLabel(usage)}
            </button>
          </TooltipTrigger>
          <TooltipContent>{USAGE_HINT}</TooltipContent>
        </Tooltip>

        <Button
          ref={historyButtonRef}
          variant="ghost"
          size="sm"
          aria-label="Ιστορικό"
          onClick={onHistory}
          className="max-md:w-8 max-md:px-0 max-sm:w-10"
        >
          <History />
          <span className="max-md:hidden">Ιστορικό</span>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Εναλλαγή θέματος"
          onClick={onToggleTheme}
        >
          {/* Driven by data-theme so the icon is right from the first paint. */}
          <Moon className="dark:hidden" />
          <Sun className="hidden dark:block" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          aria-label="Νέα μελέτη"
          onClick={onNewStudy}
          className="ml-1 max-sm:w-10 max-sm:px-0"
        >
          <Plus />
          <span className="max-sm:hidden">Νέα μελέτη</span>
        </Button>
      </div>
    </header>
  );
}
