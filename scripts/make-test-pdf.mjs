import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Build a minimal, valid single-page PDF containing extractable ASCII text.
 * Xref byte offsets are computed from the real buffer, so the result parses
 * cleanly in pdf.js / unpdf. Zero dependencies — used only for testing.
 *
 * @param {string|string[]} lines  One or more lines of (ASCII) page text.
 * @returns {Buffer}
 */
export function buildPdf(lines) {
  const text = Array.isArray(lines) ? lines : [lines];

  let content = "BT /F1 16 Tf 72 720 Td 20 TL\n";
  text.forEach((line, i) => {
    const safe = String(line).replace(/([\\()])/g, "\\$1");
    content += (i === 0 ? "" : "T* ") + "(" + safe + ") Tj\n";
  });
  content += "ET";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length " +
      Buffer.byteLength(content, "latin1") +
      " >>\nstream\n" +
      content +
      "\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  // Binary header. The 4 marker bytes are written explicitly (not via \x
  // escapes) so this source file stays pure ASCII.
  const parts = [
    Buffer.from("%PDF-1.4\n%", "latin1"),
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    Buffer.from("\n", "latin1"),
  ];
  let length = parts.reduce((n, b) => n + b.length, 0);

  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    const obj = Buffer.from(i + 1 + " 0 obj\n" + body + "\nendobj\n", "latin1");
    parts.push(obj);
    length += obj.length;
  });

  const xrefStart = length;
  let xref = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const off of offsets) {
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }
  const trailer =
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    xrefStart +
    "\n%%EOF\n";
  parts.push(Buffer.from(xref + trailer, "latin1"));

  return Buffer.concat(parts);
}

// Run directly:  node scripts/make-test-pdf.mjs [outPath]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] || "samples/_smoke-test.pdf";
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    buildPdf([
      "StudyBox pipeline smoke test.",
      "This single-page PDF verifies that text extraction works.",
      "Line three with numbers 12345 and symbols + - = .",
    ]),
  );
  console.log("Wrote test PDF:", out);
}
