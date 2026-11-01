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
