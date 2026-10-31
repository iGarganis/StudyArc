import type { GenerateParams, Mode } from "./types.ts";
import { isTestingMode } from "./types.ts";

/**
 * How many items a quiz / true-false set should contain. Kept in sync with the
 * merge target in chunking.ts (TARGET_QUESTIONS) so long, chunked documents end
 * up with the same count.
 */
export const QUESTION_COUNT = 20;

/**
 * Rules shared by every mode. Output follows the document's language; all math
 * is LaTeX.
 * NOTE: intentionally contains no literal backslashes — we describe the LaTeX
 * requirement in prose (the model produces valid LaTeX natively, and JSON mode
 * handles the escaping on the wire).
 */
const SHARED_RULES = `
You are an experienced university teaching assistant. You prepare study material for science and engineering students, with the goal of helping them pass their exams.

STRICT RULES:
1. OUTPUT LANGUAGE: write every text value in the main language of the lecture text. If the lecture is in Greek, write in Greek; if it is in English, write in English; apply the same rule to any other language. These instructions being in English must NOT affect the output language. If the text mixes languages, use the language of its explanatory prose, not of its technical terms or formulas. Use clear, correct scientific terminology in that language. When the output is not in English, you may give the English term in parentheses the first time you use a specialised term, e.g. «ιδιοτιμή (eigenvalue)».
2. ALL math must be written in valid LaTeX, including single variables such as $A$. Inline math goes between single dollar signs ($...$) and standalone equations between double dollar signs ($$...$$). Dollar signs are the ONLY allowed delimiters: never use a backslash followed by a parenthesis or a square bracket as a math delimiter. Use normal LaTeX commands (e.g. frac, sqrt, sum, int, lim, det, partial, leq, geq, neq, infty, cdot, vec, alpha, beta, pi, theta), each written with a backslash in front of it.
3. NEVER use Unicode symbols in place of LaTeX. Symbols such as × ÷ ² ³ √ ≤ ≥ ≠ ∞ ∑ ∫ ∂ ≈ → must not appear in the text, and neither may Greek letters used as math symbols (π, θ, α, β). Write them all as LaTeX. Greek letters in ordinary Greek words are of course fine.
4. Base the content ONLY on the lecture text you are given. Do not add material that is not there and do not invent facts. If something is not covered by the text, leave it out.
5. Prioritise what is likely to be asked in a university exam: definitions, theorems, conditions, key proofs, methods and solving techniques. Avoid trivial details.
6. Return ONLY valid JSON that matches the requested schema. No markdown, no code fences, no comments, no text outside the JSON. Text values are plain text too: no markdown emphasis, such as asterisks around a word.
7. Because the result is JSON, every backslash of a LaTeX command must be escaped exactly once: two backslash characters in the raw JSON, which parse to one backslash in the value. Never write four. This keeps commands such as text, theta, frac or right intact and the JSON valid.
8. Do NOT put line breaks (newlines) inside JSON strings; keep each value as one continuous text.
9. FULL COVERAGE: if the text is long (many pages or chapters), cover its WHOLE range proportionally, not just the beginning. Draw material evenly from all parts of the document (beginning, middle, end), without skipping important chapters.
`.trim();

const SUMMARY_INSTRUCTIONS = `
TASK: A summary of the lecture, for quick and efficient revision before the exam.

Response structure:
- title: a short, descriptive title for the lecture's topic.
- sections: as many sections as it takes to cover ALL the material — typically 4 to 8 for a short lecture, but 8 to 14 for a long document (50+ pages). Make sure every important chapter or topic of the text has its own section; do not squeeze several chapters into one. Each section has:
  - heading: the section's title.
  - content: 2 to 5 dense, substantial sentences with the most important points. Keep it tight and useful for the exam, not wordy.
  - keyFormulas: 0 to 4 key formulas or relations of the section. Each has:
    - latex: the formula in LaTeX, WITHOUT the surrounding dollar signs.
    - explanation: one short sentence explaining what the formula expresses and when it is used.
    If a section has no formulas, use an empty array.
- examTips: 4 to 8 practical exam tips (common mistakes, what is often asked, what the student should watch out for).
`.trim();

const ELI5_INSTRUCTIONS = `
TASK: A simple explanation (ELI5) — explain the material the way you would teach it to a friend who does not know the subject: in plain words and with intuition, but WITHOUT sacrificing scientific correctness.

Response structure:
- title: a short title for the topic.
- explanation: a flowing, simple explanation of the material's central ideas (4 to 6 dense sentences or short paragraphs; up to 8 for a long document with many concepts — cover the main topics of the whole text, not just one). Use everyday language but stay accurate: do NOT introduce errors or oversimplifications that distort the meaning. Where math is needed, write it in LaTeX.
- analogies: 2 to 5 analogies from everyday life for the most important concepts. Each has:
  - concept: the concept being illuminated.
  - analogy: the comparison, in plain words, that helps someone understand the concept without distorting it.
`.trim();

const QUIZ_INSTRUCTIONS = `
TASK: A multiple-choice quiz with ${QUESTION_COUNT} questions, for practice before the exam.

Response structure:
- title: a short title for the quiz.
- questions: EXACTLY ${QUESTION_COUNT} questions. Each question has:
  - question: the question text. Any math in LaTeX.
  - options: EXACTLY 4 answer options (strings). Any math in LaTeX.
  - correctIndex: an integer from 0 to 3 — the index of the CORRECT option in the options array.
  - explanations: EXACTLY 4 short explanations, one for each option in the SAME order — why each one is right or wrong.
  - difficulty: one of the values "easy", "medium", "hard".

Quality requirements:
- Give EXACTLY ${QUESTION_COUNT} distinct questions, with no repeated or near-identical questions.
- COVERAGE: spread the questions across ALL the material in the text (all chapters and topics), not just one part.
- Mix difficulties (a fair number of easy, medium and hard).
- AT LEAST 6 questions must require APPLYING a formula or method (calculation or reasoning), not simply recalling a definition.
- Wrong options (distractors) must be PLAUSIBLE: based on common student mistakes (e.g. a wrong sign, confused definitions), not obviously wrong.
- All questions must come from the lecture text.
`.trim();

const TRUEFALSE_INSTRUCTIONS = `
TASK: A true/false quiz with ${QUESTION_COUNT} statements, for a quick understanding check before the exam.

Response structure:
- title: a short title for the quiz.
- questions: EXACTLY ${QUESTION_COUNT} statements. Each one has:
  - statement: a CLEAR statement the student must judge as true or false. Any math in LaTeX. Avoid ambiguous or partly true wording: each statement must be indisputably true or false based on the text.
  - answer: boolean — true if the statement is TRUE, false if it is FALSE.
  - explanation: one short explanation justifying why the statement is true or false, with reference to the material.
  - difficulty: one of the values "easy", "medium", "hard".

Quality requirements:
- Give EXACTLY ${QUESTION_COUNT} distinct statements, with no repetition.
- COVERAGE: spread the statements across ALL the material in the text (all chapters and topics), not just one part.
- Mix difficulties (a fair number of easy, medium and hard).
- BALANCE the answers: roughly half of the statements true and half false (not all true or all false).
- False statements must be PLAUSIBLE: based on common student misconceptions (e.g. a reversed condition, confused definitions, a wrong sign), not obviously false.
- All statements must come from the lecture text.
`.trim();

const FLASHCARDS_INSTRUCTIONS = `
TASK: Flashcards with ${QUESTION_COUNT} cards, for active recall and revision before the exam.

Response structure:
- title: a short title for the card set.
- cards: EXACTLY ${QUESTION_COUNT} cards. Each card has:
  - front: the front side — a term, a concept or a short recall question (e.g. "What does Gauss's law state?" or "Definition: eigenvalue", written in the output language). Short and focused. Any math in LaTeX.
  - back: the back side — the answer: a definition, a formula, or a short explanation of 1–3 sentences. Complete but dense. Any math in LaTeX.
  - difficulty: one of the values "easy", "medium", "hard".

Quality requirements:
- Give EXACTLY ${QUESTION_COUNT} distinct cards, with no repeated or near-identical cards.
- COVERAGE: spread the cards across ALL the material in the text (all chapters and topics), not just one part.
- Mix difficulties (a fair number of easy, medium and hard).
- Each card must test ONE specific idea; avoid overloaded cards that combine several.
- All cards must come from the lecture text.
`.trim();

const INSTRUCTIONS: Record<Mode, string> = {
  summary: SUMMARY_INSTRUCTIONS,
  eli5: ELI5_INSTRUCTIONS,
  quiz: QUIZ_INSTRUCTIONS,
  truefalse: TRUEFALSE_INSTRUCTIONS,
  flashcards: FLASHCARDS_INSTRUCTIONS,
};

export interface BuiltPrompt {
  system: string;
  user: string;
}

/** Cap how much covered-list text we inject, to keep the prompt lean. */
const MAX_COVERED_ITEMS = 80;
const MAX_COVERED_CHARS = 220;

/**
 * Instruct the model to avoid concepts the student already has in OTHER testing
 * materials for this document — but to fall back to overlap rather than fall
 * short of the requested count when the document runs out of distinct material.
 */
function coverageBlock(mode: Mode, covered: string[] | undefined): string {
  if (!isTestingMode(mode) || !covered || covered.length === 0) return "";
  const items = covered
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 0)
    .slice(0, MAX_COVERED_ITEMS)
    .map((c) => (c.length > MAX_COVERED_CHARS ? `${c.slice(0, MAX_COVERED_CHARS)}…` : c));
  if (items.length === 0) return "";

  return (
    `ALREADY COVERED CONCEPTS: the student ALREADY has other practice material for the same text, ` +
    `covering the concepts/questions below. PREFER to cover DIFFERENT parts of the material ` +
    `and do NOT repeat these concepts. Only if the text does NOT have enough different material to ` +
    `reach the requested count may you overlap — reaching the count is the priority.\n` +
    items.map((c, i) => `${i + 1}. ${c}`).join("\n") +
    `\n\n`
  );
}

/** Build the system + user prompt for a mode against a document. */
export function buildPrompt(mode: Mode, params: GenerateParams): BuiltPrompt {
  const system = `${SHARED_RULES}\n\n${INSTRUCTIONS[mode]}`.trim();

  const context = params.courseContext?.trim()
    ? `Context from the student (e.g. course or chapter): ${params.courseContext.trim()}\n\n`
    : "";

  const coverage = coverageBlock(mode, params.covered);

  const user =
    `${context}${coverage}The lecture text follows. Based on THIS alone, prepare the requested material as valid JSON, in the main language of the text.\n\n` +
    `=== START OF TEXT ===\n${params.documentText}\n=== END OF TEXT ===`;

  return { system, user };
}
