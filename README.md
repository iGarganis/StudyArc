# StudyBox

Ανέβασε ένα PDF διάλεξης (στα ελληνικά) και πάρε **σύνοψη**, **απλή εξήγηση** και **quiz** — όλα στα ελληνικά. Week-1 MVP, εστιασμένο στην ποιότητα του pipeline.

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
- **Greek + LaTeX** — prompts force Greek output and valid LaTeX (`$...$` / `$$...$$`, never Unicode math); a validation repair pass fixes the model's occasional JSON-escaping slips.

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
lib/pdf.ts            PDF → text, with Greek errors (empty / corrupt / scanned)
lib/ai/
  types.ts            material types + AIProvider interface + AIProviderError
  prompts.ts          Greek system prompts (per mode)
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
- **UI:** the StudyBox design is applied — navy/paper palette over a grid background, IBM Plex Sans (Greek) + Manrope (Latin display), and a light/dark theme toggle (persisted in `localStorage`).
- No database or auth yet: results cache in-memory (server) and persist to `localStorage` (client).
