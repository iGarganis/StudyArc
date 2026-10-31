# StudyArc

Upload a lecture PDF and get a **summary**, **simple explanation**, **quiz**, **true/false set** and **flashcards**, generated in the language of the document.

## Setup

```bash
npm install
cp .env.local.example .env.local     # then edit .env.local and paste your key
npm run dev                          # http://localhost:3000
```

Get a free Gemini key at https://aistudio.google.com/apikey (default model: `gemini-2.5-flash`).

## How it works

PDF → text (`unpdf`) → Gemini (`@google/genai`, JSON mode) → validated typed material → KaTeX-rendered UI.

- **Provider-agnostic core** — `lib/ai/provider.ts` exposes `getProvider()`; `GeminiProvider` is the only place the SDK lives, so another backend (e.g. Groq) drops in by implementing one interface, with no caller changes.
- **Resilience** — a serializing request queue, retry with exponential backoff + jitter on transient 5xx/429, a SHA-256 cache with concurrent de-duplication, and long-document chunking.
- **Language + LaTeX** — material follows the document's language, with math as valid LaTeX (`$...$` / `$$...$$`, never Unicode math); a validation pass repairs the model's occasional JSON-escaping slips and normalises `\(...\)` / `\[...\]` delimiters.

## CLI — iterate on prompt quality without the UI

```bash
npm run test:pipeline -- samples/your-lecture.pdf summary    # or: eli5 / quiz
npm run test:pipeline -- samples/notes.txt quiz              # .txt/.md also accepted
```

Drop your real course PDFs into `samples/` (git-ignored). This is the core Week-1 loop: run your own material through each mode and tune `lib/ai/prompts.ts` until the output reads well.

## Offline tests (no API key needed)

```bash
node scripts/verify-extract.mjs   # PDF text extraction + error cases
node scripts/verify-parse.mjs     # summary/eli5/quiz validators (20 tests)
node scripts/verify-step4.mjs     # queue / cache / chunking / quota routing (26 tests)
```

## Layout

```
lib/pdf.ts            PDF → text, with typed errors (empty / corrupt / scanned)
lib/ai/
  types.ts            material types + AIProvider interface + AIProviderError
  prompts.ts          system prompts (per mode)
  gemini.ts           GeminiProvider — the only file importing the SDK
  validate.ts         JSON → typed material (+ LaTeX-escape repair)
  retry.ts queue.ts chunking.ts   resilience layer
  generate.ts         orchestration: cache → dedup → queue → chunk → provider
  provider.ts         getProvider() factory + public type surface
lib/cache.ts          swappable cache (in-memory now, Supabase later)
app/api/generate/     upload → extract → generate route
app/page.tsx, components/   the UI (upload, KaTeX views, interactive quiz)
samples/              your PDFs (git-ignored)
```

## Notes

- **Free tier:** ~15 req/min, ~1,500 req/day on `gemini-2.5-flash`. During Google demand spikes you may see transient `503`s — the retry layer absorbs them.
- **UI:** shadcn/ui with the Zinc theme, Inter (Latin + Greek, for generated material), no motion, and a light/dark toggle (persisted in `localStorage`). The design source is `docs/design/studybox-redesign.html`.
- No database or auth yet: results cache in-memory (server) and persist to `localStorage` (client).
