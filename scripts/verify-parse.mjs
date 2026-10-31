import { parseSummary, parseEli5, parseQuiz } from "../lib/ai/validate.ts";
import { AIProviderError } from "../lib/ai/types.ts";

// Deterministic tests for all three parsers — no network / API key.
let failures = 0;
const ok = (cond, name, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? "  -> " + extra : ""}`);
  if (!cond) failures++;
};
const expectInvalid = (fn, name) => {
  try {
    fn();
    ok(false, name, "did not throw");
  } catch (e) {
    ok(e instanceof AIProviderError && e.code === "INVALID_RESPONSE", name, e?.code ?? String(e));
  }
};

const BS = String.fromCharCode(92);
const TAB = String.fromCharCode(9);
const FF = String.fromCharCode(12);

console.log("--- summary ---");
const frac = `${BS}frac{${BS}partial u}{${BS}partial x}`;
const sm = parseSummary({
  title: "Μιγαδική Ανάλυση",
  sections: [
    {
      heading: "Cauchy-Riemann",
      content: "κείμενο",
      keyFormulas: [
        { latex: frac, explanation: "εξήγηση" },
        { latex: "   ", explanation: "κενό" },
      ],
    },
    { heading: "Χωρίς τύπους", content: "μόνο κείμενο", keyFormulas: [] },
  ],
  examTips: ["συμβουλή", ""],
});
ok(sm.mode === "summary", "summary: mode");
ok(sm.sections.length === 2, "summary: sections kept", `${sm.sections.length}`);
ok(sm.sections[0].keyFormulas.length === 1, "summary: blank formula dropped");
ok(sm.sections[0].keyFormulas[0].latex === frac, "summary: latex preserved");
ok(sm.examTips.length === 1, "summary: blank tip dropped");

const rep = parseSummary({
  title: "t",
  sections: [{ heading: "h", content: `${TAB}ext{v} και ${FF}rac{a}{b}`, keyFormulas: [] }],
  examTips: [],
});
ok(rep.sections[0].content.includes(`${BS}text{v}`), "summary: repairs TAB -> \\text");
ok(rep.sections[0].content.includes(`${BS}frac{a}{b}`), "summary: repairs FF -> \\frac");

expectInvalid(() => parseSummary(42), "summary: rejects non-object");
expectInvalid(() => parseSummary({ title: "x", sections: [], examTips: [] }), "summary: rejects empty sections");

console.log("\n--- eli5 ---");
const e = parseEli5({
  title: "Παράγωγος",
  explanation: "Η παράγωγος μετρά πόσο γρήγορα αλλάζει κάτι.",
  analogies: [
    { concept: "ταχύτητα", analogy: "σαν το κοντέρ του αυτοκινήτου" },
    { concept: "κενό", analogy: "" },
  ],
});
ok(e.mode === "eli5", "eli5: mode");
ok(e.title === "Παράγωγος", "eli5: title preserved");
ok(e.analogies.length === 1, "eli5: blank analogy dropped", `${e.analogies.length}`);
expectInvalid(() => parseEli5({ title: "x", explanation: "", analogies: [] }), "eli5: rejects empty explanation");

console.log("\n--- quiz ---");
const q = parseQuiz({
  title: "Quiz Παραγώγων",
  questions: [
    { question: "Q1", options: ["A", "B", "C", "D"], correctIndex: 9, explanations: ["a"], difficulty: "TRICKY" },
    { question: "Q2", options: ["A", "B", "C", "D"], correctIndex: 2, explanations: ["a", "b", "c", "d"], difficulty: "hard" },
    { question: "", options: ["A", "B", "C", "D"], correctIndex: 0, explanations: [], difficulty: "easy" },
  ],
});
ok(q.mode === "quiz", "quiz: mode");
ok(q.questions.length === 2, "quiz: blank question dropped", `${q.questions.length}`);
ok(q.questions[0].correctIndex === 3, "quiz: correctIndex clamped", `${q.questions[0].correctIndex}`);
ok(q.questions[0].explanations.length === 4, "quiz: explanations padded to 4", `${q.questions[0].explanations.length}`);
ok(q.questions[0].difficulty === "medium", "quiz: bad difficulty -> medium", q.questions[0].difficulty);
ok(q.questions[1].difficulty === "hard", "quiz: valid difficulty kept");
expectInvalid(() => parseQuiz({ title: "x", questions: [] }), "quiz: rejects empty questions");

console.log("--- math delimiters ---");
// The UI only renders $...$ and $...$.
{
  const d = parseSummary({
    title: `Τίτλος ${BS}(x${BS})`,
    sections: [
      {
        heading: "h",
        content: `inline ${BS}(a + b${BS}) and display ${BS}[c${BS}] stay readable`,
        keyFormulas: [
          { latex: `${BS}(E = mc^2${BS})`, explanation: "wrapped" },
          { latex: "$$F = ma$$", explanation: "wrapped in dollars" },
          { latex: `a ${BS}${BS}[2pt] b`, explanation: "matrix row break" },
        ],
      },
    ],
    examTips: [],
  });
  ok(d.title === "Τίτλος $x$", "delims: inline converted in the title");
  ok(
    d.sections[0].content === "inline $a + b$ and display $$c$$ stay readable",
    "delims: inline and display converted in prose",
  );
  ok(d.sections[0].keyFormulas[0].latex === "E = mc^2", "delims: stripped from a formula");
  ok(d.sections[0].keyFormulas[1].latex === "F = ma", "delims: dollars stripped from a formula");
  ok(
    d.sections[0].keyFormulas[2].latex === `a ${BS}${BS}[2pt] b`,
    "delims: a matrix row break is left alone",
  );
}

console.log("--- over-escaping ---");
{
  const DBL = BS + BS;
  const parsed = (content) =>
    parseSummary({
      title: "t",
      sections: [{ heading: "h", content, keyFormulas: [] }],
      examTips: [],
    }).sections[0].content;

  ok(
    parsed(`a ${DBL}(${DBL}lambda${DBL}) b`) === `a $${BS}lambda$ b`,
    "escape: doubled inline math is repaired",
  );
  ok(
    parsed(`${DBL}[A ${DBL}cdot B${DBL}]`) === `$$A ${BS}cdot B$$`,
    "escape: doubled display math is repaired",
  );
  ok(
    parsed(`${DBL}(${DBL}begin{pmatrix} a ${DBL}${DBL} b ${DBL}end{pmatrix}${DBL})`) ===
      `$${BS}begin{pmatrix} a ${DBL} b ${BS}end{pmatrix}$`,
    "escape: a doubled matrix row break becomes a normal one",
  );
  const proper = `$${BS}begin{pmatrix} a ${DBL} b ${BS}end{pmatrix}$`;
  ok(parsed(proper) === proper, "escape: a proper matrix is left alone");
  const spaced = `$a ${DBL}[2pt] b$`;
  ok(parsed(spaced) === spaced, "escape: a row break with spacing is left alone");
}

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exitCode = failures === 0 ? 0 : 1;
