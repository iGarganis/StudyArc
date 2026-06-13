import { extractText, getDocumentProxy, getMeta } from "unpdf";

export type PdfErrorCode = "EMPTY_FILE" | "CORRUPT_PDF" | "NO_TEXT";

/**
 * Thrown for any problem turning an uploaded file into usable text.
 * `userMessage` is Greek and safe to show directly in the UI.
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

/** Below this many non-whitespace chars we treat the PDF as having no usable text. */
const MIN_MEANINGFUL_CHARS = 40;

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
      "Το αρχείο είναι κενό. Ανέβασε ένα έγκυρο PDF.",
    );
  }

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // Clone the bytes: pdf.js may detach/transfer the underlying buffer.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    throw new PdfExtractionError(
      "CORRUPT_PDF",
      "Δεν ήταν δυνατή η ανάγνωση του PDF. Μπορεί να είναι κατεστραμμένο ή κλειδωμένο με κωδικό.",
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
      "Παρουσιάστηκε σφάλμα κατά την ανάγνωση του περιεχομένου του PDF.",
    );
  }

  const text = normalizeText(rawText);

  if (text.replace(/\s/g, "").length < MIN_MEANINGFUL_CHARS) {
    throw new PdfExtractionError(
      "NO_TEXT",
      "Δεν βρέθηκε επιλέξιμο κείμενο σε αυτό το PDF. Πιθανότατα είναι σαρωμένο (εικόνες σελίδων). " +
        "Δοκίμασε ένα PDF όπου μπορείς να επιλέξεις το κείμενο με το ποντίκι.",
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
