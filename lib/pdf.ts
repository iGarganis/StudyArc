import { extractText, getDocumentProxy, getMeta } from "unpdf";
import { MIN_TEXT_CHARS } from "./limits.ts";

export type PdfErrorCode = "EMPTY_FILE" | "CORRUPT_PDF" | "NO_TEXT";

/**
 * Thrown for any problem turning an uploaded file into usable text.
 * `userMessage` is safe to show directly in the UI.
 */
export class PdfExtractionError extends Error {
  readonly code: PdfErrorCode;
  readonly userMessage: string;

  constructor(code: PdfErrorCode, userMessage: string) {
    super(`[${code}] ${userMessage}`);
    this.name = "PdfExtractionError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export interface ExtractedPdf {
  /** Cleaned, whitespace-normalised full text of the document. */
  text: string;
  totalPages: number;
  charCount: number;
  meta: { title?: string; author?: string };
}

/**
 * Extract plain text from a PDF buffer.
 * Throws {@link PdfExtractionError} for empty / corrupt / image-only PDFs.
 */
export async function extractPdfText(
  input: ArrayBuffer | Uint8Array,
): Promise<ExtractedPdf> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.byteLength === 0) {
    throw new PdfExtractionError(
      "EMPTY_FILE",
      "The file is empty. Upload a valid PDF.",
    );
  }

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // Clone the bytes: pdf.js may detach/transfer the underlying buffer.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    throw new PdfExtractionError(
      "CORRUPT_PDF",
      "The PDF could not be read. It may be corrupt or password protected.",
    );
  }

  let totalPages = 0;
  let rawText = "";
  try {
    const result = await extractText(pdf, { mergePages: true });
    totalPages = result.totalPages;
    rawText = result.text;
  } catch {
    throw new PdfExtractionError(
      "CORRUPT_PDF",
      "An error occurred while reading the PDF's content.",
    );
  }

  const text = normalizeText(rawText);

  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new PdfExtractionError(
      "NO_TEXT",
      "No selectable text was found in this PDF. It is probably scanned (images of pages). " +
        "Try a PDF whose text you can select with the mouse.",
    );
  }

  return { text, totalPages, charCount: text.length, meta: await readMeta(pdf) };
}

async function readMeta(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<ExtractedPdf["meta"]> {
  try {
    const { info } = (await getMeta(pdf)) as { info?: Record<string, unknown> };
    const title = typeof info?.Title === "string" ? info.Title.trim() : "";
    const author = typeof info?.Author === "string" ? info.Author.trim() : "";
    return { title: title || undefined, author: author || undefined };
  } catch {
    return {};
  }
}

// Chars to drop outright: NUL (0x00) and soft hyphen (0x00AD, common in
// justified PDF text). Built via fromCharCode so the source stays plain ASCII.
const STRIP_CHARS = new RegExp(`[${String.fromCharCode(0x00, 0x00ad)}]`, "g");

/** Light normalisation: keep content intact (incl. math), just tidy whitespace. */
function normalizeText(input: string): string {
  return input
    .replace(STRIP_CHARS, "")
    .replace(/\r\n?/g, "\n") // normalise line endings
    .replace(/[^\S\n]+/g, " ") // collapse runs of spaces/tabs, keep newlines
    .replace(/ +\n/g, "\n") // trim trailing spaces per line
    .replace(/\n{3,}/g, "\n\n") // collapse 3+ blank lines
    .trim();
}
