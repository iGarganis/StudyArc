# samples

Put your own PDFs here to try the prompts without the UI. Everything in this folder except this file is git-ignored.

Generate one format from a file (this uses your Gemini quota):

```bash
npm run test:pipeline -- samples/lecture.pdf summary   # or eli5, quiz, truefalse, flashcards
```

`.txt` and `.md` files work too.

Check text extraction only, with no API key:

```bash
node scripts/verify-extract.mjs samples/lecture.pdf
```

A PDF that reports `NO_TEXT` is almost always scanned: its pages are images, so there is no text to read.

`node scripts/make-test-pdf.mjs` writes a small test PDF to `samples/_smoke-test.pdf`.
