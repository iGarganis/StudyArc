"use client";

import { useRef, useState, type DragEvent } from "react";
import { CircleAlert, Download, File as FileIcon, FileText, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SAMPLE_FILE_NAME, humanSize } from "@/lib/study";
import { cn } from "@/lib/utils";
import type { UiError } from "@/lib/uiErrors";

const DROP_HINT = "Drop the file here";
const ROW = "flex items-center gap-3 rounded-lg border py-3 pr-3 pl-4";
const ROW_DRAG = "border-foreground bg-muted";

/**
 * The three states of the upload area: empty dropzone, selected file, and a
 * reopened study whose file is gone. All of them accept a dropped PDF, except
 * while a generation is running.
 */
export function UploadArea({
  file,
  studyName,
  busy,
  error,
  onChoose,
  onClear,
}: {
  file: File | null;
  /** Name of the open study when its file is no longer available. */
  studyName: string | null;
  busy: boolean;
  error: UiError | null;
  onChoose: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (!busy) setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      // Moving between children also fires dragleave; only react on real exits.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDragging(false);
      }
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!busy) onChoose(e.dataTransfer.files?.[0]);
    },
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf"
      className="sr-only"
      // In the study row the visible button is the keyboard entry point.
      tabIndex={studyName ? -1 : undefined}
      onChange={(e) => {
        onChoose(e.target.files?.[0]);
        e.target.value = ""; // so picking the same file again still fires
      }}
    />
  );

  let area;
  if (file) {
    area = (
      <div className={`${ROW} ${dragging ? ROW_DRAG : ""}`} {...dropHandlers}>
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate font-medium">
          {dragging ? DROP_HINT : file.name}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {humanSize(file.size)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onClear}
          className="ml-auto"
        >
          Change
        </Button>
      </div>
    );
  } else if (studyName) {
    area = (
      <div
        className={`relative max-sm:flex-wrap ${ROW} ${dragging ? ROW_DRAG : ""}`}
        {...dropHandlers}
      >
        {input}
        <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col max-sm:basis-[calc(100%-28px)]">
          <span className="truncate font-medium">
            {dragging ? DROP_HINT : studyName}
          </span>
          <span className="text-xs text-muted-foreground">
            {studyName === SAMPLE_FILE_NAME
              ? "This is a sample study. Upload your own PDF to generate material."
              : "To generate more, upload the PDF again or drag it here."}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="max-sm:w-full"
        >
          <Upload />
          Upload PDF
        </Button>
      </div>
    );
  } else {
    area = (
      <label {...dropHandlers} className="relative block cursor-pointer">
        {input}
        <Card
          className={
            "flex min-h-40 justify-center gap-3 p-5 [input:focus-visible~&]:outline-2 [input:focus-visible~&]:outline-offset-2 [input:focus-visible~&]:outline-ring max-sm:flex-col sm:h-40 sm:items-center sm:justify-start sm:gap-4 sm:p-6 " +
            (dragging ? "border-foreground bg-muted" : "hover:bg-muted/50")
          }
        >
          <span
            className={
              "size-10 shrink-0 items-center justify-center rounded-md max-sm:hidden sm:inline-flex " +
              (dragging ? "bg-background" : "bg-muted")
            }
          >
            {dragging ? (
              <Download className="size-5" aria-hidden />
            ) : (
              <Upload className="size-5" aria-hidden />
            )}
          </span>
          {dragging ? (
            <span className="text-base leading-6 font-medium">{DROP_HINT}</span>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base leading-6 font-medium">
                  Drag a PDF here
                </span>
                <span className="text-muted-foreground">PDF, up to 20 MB</span>
              </span>
              <span
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "max-sm:w-full",
                )}
              >
                Choose file
              </span>
            </>
          )}
        </Card>
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {area}
      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
