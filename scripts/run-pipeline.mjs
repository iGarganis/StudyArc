import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractPdfText } from "../lib/pdf.ts";
import { generateStudyMaterial } from "../lib/ai/generate.ts";

// Usage: npm run test:pipeline -- <file.pdf|file.txt> [summary|eli5|quiz|truefalse|flashcards]
// A .txt/.md file is used as the document text directly (handy for iterating on
// prompts without making a PDF); anything else is treated as a PDF.
const args = process.argv.slice(2);
const inputPath = args[0];
const mode = args[1] ?? "summary";

if (!inputPath || inputPath === "--help" || inputPath === "-h") {
  console.error(
    "Usage: npm run test:pipeline -- <file.pdf|file.txt> [summary|eli5|quiz|truefalse|flashcards]",
  );
  process.exit(inputPath ? 0 : 1);
}
if (!["summary", "eli5", "quiz", "truefalse", "flashcards"].includes(mode)) {
  console.error(
    `Unknown mode "${mode}". Use: summary | eli5 | quiz | truefalse | flashcards`,
  );
  process.exit(1);
}

const started = Date.now();
try {
  const ext = extname(inputPath).toLowerCase();
  let documentText;
  let srcInfo;
  if (ext === ".txt" || ext === ".md") {
    documentText = await readFile(inputPath, "utf8");
    srcInfo = `${documentText.length} chars (text)`;
  } else {
    const extracted = await extractPdfText(await readFile(inputPath));
    documentText = extracted.text;
    srcInfo = `${extracted.totalPages} page(s), ${extracted.charCount} chars`;
  }

  console.error(`[input] ${srcInfo}. Generating "${mode}" with Gemini...`);
  const { material, usageTokens } = await generateStudyMaterial({ documentText, mode });
  process.stdout.write(JSON.stringify(material, null, 2) + "\n");
  console.error(`[done] ${((Date.now() - started) / 1000).toFixed(1)}s · ${usageTokens} tokens`);
} catch (err) {
  const code = err?.code ? ` [${err.code}]` : "";
  const msg = err?.userMessage ?? err?.message ?? String(err);
  console.error(`\n[error]${code} ${msg}`);
  const cause = err?.cause;
  if (cause) {
    const status = cause?.status ?? cause?.code ?? "?";
    console.error(`[cause] ${cause?.name ?? "Error"} status=${status}: ${cause?.message ?? cause}`);
  }
  process.exitCode = 1;
}
