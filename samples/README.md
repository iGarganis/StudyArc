# samples/

Drop 2–3 of your real Greek course PDFs here to iterate on pipeline quality with
actual content. A good mix: a complex-analysis lecture (heavy math), an algorithms
handout (definitions + pseudocode), and your C notes (text + code).

## Run a mode end-to-end against a file (after the pipeline is wired up)

```bash
npm run test:pipeline -- samples/your-file.pdf summary
npm run test:pipeline -- samples/your-file.pdf eli5
npm run test:pipeline -- samples/your-file.pdf quiz
```

## Just check that text extraction works

```bash
# built-in self-tests (generated PDF + error cases)
node scripts/verify-extract.mjs

# or point it at a real file to see the extracted text
node scripts/verify-extract.mjs samples/your-file.pdf
```

If a real PDF reports `NO_TEXT`, it is almost certainly a scanned/image-only
document — there is no selectable text for us to read.

---

Your course PDFs in this folder are git-ignored (only this README is committed).
`_smoke-test.pdf` is a tiny generated fixture; regenerate it with
`node scripts/make-test-pdf.mjs`.
