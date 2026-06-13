import katex from "katex";
import type { GeneratedMaterial, Mode } from "@/lib/ai/types";

/**
 * Client-side "download as PDF" for a generated study panel.
 *
 * We build a clean, self-contained print document straight from the material
 * data — not from the on-screen DOM — so quizzes always export with the full
 * answer key and explanations, no matter what the user clicked. Rendering goes
 * through the browser's own print engine, which handles Greek text and the
 * KaTeX web fonts natively, so there's nothing extra to bundle.
 */

const MODE_LABEL: Record<Mode, string> = {
  summary: "Σύνοψη",
  eli5: "Απλή εξήγηση",
  quiz: "Quiz",
  truefalse: "Σωστό / Λάθος",
  flashcards: "Κάρτες",
};

/** Greek capital letter for an option index (0 → Α, 1 → Β, ...). */
const letter = (i: number) => String.fromCharCode(913 + i);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render model text with embedded LaTeX ($$display$$, $inline$) to HTML. */
function mathToHtml(text: string): string {
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out += `<span class="t">${escapeHtml(text.slice(last, m.index))}</span>`;
    }
    const display = m[1] !== undefined;
    const latex = (display ? m[1] : m[2]) ?? "";
    try {
      out += katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        output: "htmlAndMathml",
      });
    } catch {
      out += escapeHtml(latex);
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    out += `<span class="t">${escapeHtml(text.slice(last))}</span>`;
  }
  return out;
}

function bodyHtml(material: GeneratedMaterial): string {
  switch (material.mode) {
    case "summary": {
      const sections = material.sections
        .map((s) => {
          const formulas = s.keyFormulas
            .map(
              (f) =>
                `<div class="formula">${mathToHtml(`$$${f.latex}$$`)}` +
                `<div class="fexp">${escapeHtml(f.explanation)}</div></div>`,
            )
            .join("");
          return (
            `<section><h2>${escapeHtml(s.heading)}</h2>` +
            `<p>${mathToHtml(s.content)}</p>${formulas}</section>`
          );
        })
        .join("");
      const tips =
        material.examTips.length > 0
          ? `<section><h2>Συμβουλές για την εξέταση</h2><ul>` +
            material.examTips.map((t) => `<li>${mathToHtml(t)}</li>`).join("") +
            `</ul></section>`
          : "";
      return `<h1>${escapeHtml(material.title)}</h1>${sections}${tips}`;
    }

    case "eli5": {
      const analogies =
        material.analogies.length > 0
          ? `<h2>Αναλογίες</h2>` +
            material.analogies
              .map(
                (a) =>
                  `<p><b>${escapeHtml(a.concept)}:</b> ${mathToHtml(a.analogy)}</p>`,
              )
              .join("")
          : "";
      return (
        `<h1>${escapeHtml(material.title)}</h1>` +
        `<p>${mathToHtml(material.explanation)}</p>${analogies}`
      );
    }

    case "quiz": {
      const qs = material.questions
        .map((q, qi) => {
          const opts = q.options
            .map((opt, oi) => {
              const correct = oi === q.correctIndex;
              return (
                `<li class="opt${correct ? " correct" : ""}">` +
                `<span class="let">${letter(oi)}.</span> ${mathToHtml(opt)}` +
                `${correct ? ' <span class="tick">✓</span>' : ""}</li>`
              );
            })
            .join("");
          const ans =
            `<div class="ans"><b>Σωστή απάντηση (${letter(q.correctIndex)}):</b> ` +
            `${mathToHtml(q.explanations[q.correctIndex] ?? "")}</div>`;
          return (
            `<div class="q"><p class="qh"><b>${qi + 1}.</b> ${mathToHtml(q.question)} ` +
            `<span class="diff">${escapeHtml(q.difficulty)}</span></p>` +
            `<ul class="opts">${opts}</ul>${ans}</div>`
          );
        })
        .join("");
      return `<h1>${escapeHtml(material.title)}</h1>${qs}`;
    }

    case "truefalse": {
      const qs = material.questions
        .map((q, qi) => {
          return (
            `<div class="q"><p class="qh"><b>${qi + 1}.</b> ${mathToHtml(q.statement)} ` +
            `<span class="diff">${escapeHtml(q.difficulty)}</span></p>` +
            `<div class="ans"><b>Απάντηση: ${q.answer ? "Σωστό" : "Λάθος"}.</b> ` +
            `${mathToHtml(q.explanation)}</div></div>`
          );
        })
        .join("");
      return `<h1>${escapeHtml(material.title)}</h1>${qs}`;
    }

    case "flashcards": {
      const cards = material.cards
        .map((c, ci) => {
          return (
            `<div class="q"><p class="qh"><b>${ci + 1}.</b> ${mathToHtml(c.front)} ` +
            `<span class="diff">${escapeHtml(c.difficulty)}</span></p>` +
            `<div class="ans">${mathToHtml(c.back)}</div></div>`
          );
        })
        .join("");
      return `<h1>${escapeHtml(material.title)}</h1>${cards}`;
    }
  }
}

const PRINT_CSS = `
@page { margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #1b2430; line-height: 1.55; font-size: 12pt; margin: 0; }
.doc-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 16px; }
.brand { font-weight: 800; font-size: 16pt; color: #1e3a5f; letter-spacing: -0.01em; }
.meta { font-size: 9.5pt; color: #6e6a60; text-align: right; }
h1 { font-size: 17pt; margin: 0 0 12px; }
h2 { font-size: 13pt; color: #1e3a5f; margin: 16px 0 6px; }
p { margin: 6px 0; }
.t { white-space: pre-wrap; }
.formula { background: #f7f5f0; border: 1px solid #e7e3da; border-radius: 6px; padding: 8px 10px; margin: 8px 0; overflow-x: hidden; }
.fexp { color: #6e6a60; font-size: 10pt; margin-top: 4px; }
ul, ol { margin: 6px 0; padding-left: 22px; }
li { margin: 4px 0; }
.q { border-top: 1px solid #e7e3da; padding: 10px 0; page-break-inside: avoid; break-inside: avoid; }
.qh { margin: 0 0 6px; }
.diff { font-size: 8.5pt; color: #6e6a60; border: 1px solid #e7e3da; border-radius: 10px; padding: 0 6px; margin-left: 4px; }
.opts { list-style: none; padding-left: 0; }
.opt { border: 1px solid #e7e3da; border-radius: 6px; padding: 5px 9px; margin: 4px 0; }
.opt.correct { background: #e3f2ea; border-color: #2f7d5b; }
.let { font-weight: 700; color: #1e3a5f; }
.tick { color: #2f7d5b; font-weight: 700; }
.ans { background: #eef2f7; border-radius: 6px; padding: 7px 10px; margin-top: 6px; font-size: 11pt; }
.katex { font-size: 1.04em; }
.katex-display { margin: 6px 0; text-align: left; }
`;

function buildPrintDoc(material: GeneratedMaterial, fileName: string): string {
  const label = MODE_LABEL[material.mode];
  const date = new Date().toLocaleDateString("el-GR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // Print after the KaTeX fonts have settled so math glyphs aren't missing.
  const printScript =
    `window.onload=function(){var go=function(){try{window.focus();window.print();}catch(e){}};` +
    `if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(go,60);});}` +
    `else{setTimeout(go,300);}};`;
  return (
    `<!doctype html><html lang="el"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(fileName)} — ${label}</title>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">` +
    `<style>${PRINT_CSS}</style></head><body>` +
    `<header class="doc-head"><div class="brand">StudyBox</div>` +
    `<div class="meta">${label}<br>${escapeHtml(fileName)} · ${date}</div></header>` +
    `<main>${bodyHtml(material)}</main>` +
    `<script>${printScript}</script></body></html>`
  );
}

/** Open the browser's print dialog for one study panel (user picks "Save as PDF"). */
export function exportMaterialToPdf(
  material: GeneratedMaterial,
  fileName: string,
): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Off-screen but NOT display:none — display:none iframes don't print.
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const win = iframe.contentWindow;
  if (!win) {
    cleanup();
    return;
  }

  win.document.open();
  win.document.write(buildPrintDoc(material, fileName));
  win.document.close();

  // Remove the iframe once the dialog closes (printed or cancelled), with a
  // long fallback in case the browser never fires `afterprint`.
  win.onafterprint = () => setTimeout(cleanup, 200);
  setTimeout(cleanup, 60_000);
}
