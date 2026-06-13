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

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exitCode = failures === 0 ? 0 : 1;
