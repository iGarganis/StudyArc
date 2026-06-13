import { readFile } from "node:fs/promises";
import { buildPdf } from "./make-test-pdf.mjs";
import { extractPdfText, PdfExtractionError } from "../lib/pdf.ts";

let failures = 0;
const codeOf = (e) =>
  e instanceof PdfExtractionError
    ? e.code
    : e && e.constructor
      ? e.constructor.name
      : String(e);

async function expectOk(name, bytes, mustInclude) {
  try {
    const res = await extractPdfText(bytes);
    const ok = mustInclude ? res.text.includes(mustInclude) : true;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${name}  (pages=${res.totalPages}, chars=${res.charCount})`,
    );
    if (!ok) {
      console.log("        expected to include:", JSON.stringify(mustInclude));
      console.log("        got preview:", JSON.stringify(res.text.slice(0, 160)));
      failures++;
    }
    return res;
  } catch (e) {
    console.log(`FAIL  ${name}  unexpected ${codeOf(e)}: ${e?.message ?? e}`);
    failures++;
  }
}

async function expectError(name, bytes, code) {
  try {
    await extractPdfText(bytes);
    console.log(`FAIL  ${name}  expected ${code} but extraction succeeded`);
    failures++;
  } catch (e) {
    const got = codeOf(e);
    console.log(`${got === code ? "PASS" : "FAIL"}  ${name}  -> ${got}`);
    if (got !== code) failures++;
  }
}

const argPath = process.argv[2];
if (argPath) {
  const buf = await readFile(argPath);
  const res = await expectOk(`file: ${argPath}`, buf);
  if (res) {
    console.log("\n--- text preview (first 600 chars) ---");
    console.log(res.text.slice(0, 600));
    console.log("--------------------------------------");
  }
} else {
  console.log("PDF extraction self-tests:\n");
  await expectOk(
    "valid generated PDF",
    buildPdf([
      "StudyBox pipeline smoke test.",
      "Extraction works across multiple content lines here.",
    ]),
    "StudyBox pipeline smoke test",
  );
  await expectError("empty file (0 bytes)", new Uint8Array(0), "EMPTY_FILE");
  await expectError(
    "garbage / non-PDF bytes",
    Buffer.from("just plain text, definitely not a pdf"),
    "CORRUPT_PDF",
  );
}

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exitCode = failures === 0 ? 0 : 1;
