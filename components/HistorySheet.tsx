"use client";

import type { RefObject } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  USAGE_HINT,
  groupSessions,
  sessionModes,
  usageLabel,
  type Session,
  type Usage,
} from "@/lib/study";

export function HistorySheet({
  open,
  onOpenChange,
  sessions,
  activeId,
  usage,
  returnFocusRef,
  onOpenSession,
  onDeleteSession,
}: {
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: Session[];
  activeId: string | null;
  usage: Usage;
  onOpenSession: (session: Session) => void;
  onDeleteSession: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onCloseAutoFocus={(e) => {
          // The sheet has no Radix trigger, so hand focus back explicitly.
          e.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <div className="flex items-start gap-2 py-3 pr-3 pl-4 sm:pt-4 sm:pr-4 sm:pl-5">
          <div className="flex flex-1 flex-col gap-0.5 max-sm:pt-1">
            <SheetTitle>History</SheetTitle>
            <SheetDescription>
              Stored only in this browser.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </div>
        <Separator />

        {sessions.length === 0 ? (
          <p className="flex-1 px-5 py-6 text-muted-foreground">
            No history yet. The material you generate will appear here.
          </p>
        ) : (
          <nav
            aria-label="Studies"
            className="flex-1 overflow-y-auto px-2 pb-4"
          >
            {groupSessions(sessions).map(([group, items]) => (
              <div key={group}>
                <p className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">
                  {group}
                </p>
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={
                      "flex items-center gap-2 rounded-md py-2 pr-2 pl-3 " +
                      (s.id === activeId ? "bg-muted" : "hover:bg-muted/50")
                    }
                  >
                    <button
                      type="button"
                      aria-current={s.id === activeId}
                      onClick={() => onOpenSession(s)}
                      className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-sm text-left"
                    >
                      <span className="max-w-full truncate font-medium">
                        {s.fileName}
                      </span>
                      <span className="max-w-full truncate text-xs text-muted-foreground">
                        {sessionModes(s.panels) || "—"}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete study ${s.fileName}`}
                      onClick={() => onDeleteSession(s.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </nav>
        )}

        {/* Below 640px the usage counter moves here from the top bar. */}
        <div className="sm:hidden">
          <Separator />
          <div className="flex flex-col gap-1 px-4 pt-3 pb-4">
            <p className="text-xs font-medium tabular-nums">
              {usageLabel(usage)}
            </p>
            <p className="text-xs text-muted-foreground">{USAGE_HINT}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
