// Serves unpdf's PDF.js build as a static file, because Turbopack's parser rejects
// it ("duplicate private name"). See lib/browserPdf.ts. Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/unpdf/dist/pdfjs.mjs", "public/vendor/pdfjs.mjs");
