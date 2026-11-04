/**
 * Whether the file starts like a PDF. The "%PDF-" marker may follow a little
 * leading junk, which PDF readers accept, so the first kilobyte is searched.
 */
export async function looksLikePdf(file: File) {
  try {
    const head = await file.slice(0, 1024).text();
    return head.includes("%PDF-");
  } catch {
    return false;
  }
}

// Copied here by scripts/copy-pdfjs.mjs.
const PDFJS_URL = "/vendor/pdfjs.mjs";

/**
 * Read a PDF in the browser, loading the parser only when it's first needed. It
 * is imported from a static file, with the bundler told to leave it alone.
 */
export async function readPdfInBrowser(file: File) {
  const { definePDFJSModule } = await import("unpdf");
  await definePDFJSModule(() => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS_URL));
  const { extractPdfText } = await import("@/lib/pdf");
  return extractPdfText(new Uint8Array(await file.arrayBuffer()));
}
