/** Largest PDF the browser will read. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

/**
 * Largest extracted text the API accepts. Vercel rejects request bodies above
 * about 4.5 MB, which is why PDFs are read in the browser and only text is sent.
 */
export const MAX_TEXT_BYTES = 4_000_000;

/** Below this many non-whitespace chars, a PDF has no usable text. */
export const MIN_TEXT_CHARS = 40;
