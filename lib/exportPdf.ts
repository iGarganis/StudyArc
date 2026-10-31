import katex from "katex";
import type { GeneratedMaterial, Mode } from "@/lib/ai/types";
import { DIFFICULTY_LABEL, optionLetter as letter } from "@/lib/study";

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

/** The title block: material title plus an optional one-line note. */
function titleHtml(title: string, note?: string): string {
  return (
    `<div class="title"><h1 class="pt">${mathToHtml(title)}</h1>` +
    `${note ? `<p class="pmeta">${escapeHtml(note)}</p>` : ""}</div>`
  );
}

/** The numbered question line shared by quiz and true/false items. */
function questionRow(n: number, text: string, difficulty: string): string {
  return (
    `<div class="qrow"><span class="n">${n}.</span>` +
    `<p class="q">${mathToHtml(text)}</p><span class="diff">${escapeHtml(difficulty)}</span></div>`
  );
}

function bodyHtml(material: GeneratedMaterial): string {
  switch (material.mode) {
    case "summary": {
      const sections = material.sections
        .map((s) => {
          const formulas = s.keyFormulas
            .map(
              (f) =>
                `<div class="formula print-item">${mathToHtml(`$$${f.latex}$$`)}` +
                `<p class="fexp">${mathToHtml(f.explanation)}</p></div>`,
            )
            .join("");
          return (
            `<section><h2>${mathToHtml(s.heading)}</h2>` +
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
      return titleHtml(material.title) + sections + tips;
    }

    case "eli5": {
      const analogies =
        material.analogies.length > 0
          ? `<section><h2>Αναλογίες</h2>` +
            material.analogies
              .map(
                (a) =>
                  `<p class="print-item"><b>${mathToHtml(a.concept)}:</b> ${mathToHtml(a.analogy)}</p>`,
              )
              .join("") +
            `</section>`
          : "";
      return (
        titleHtml(material.title) +
        `<section><p>${mathToHtml(material.explanation)}</p></section>${analogies}`
      );
    }

    case "quiz": {
      const qs = material.questions
        .map((q, qi) => {
          const opts = q.options
            .map((opt, oi) => {
              const correct = oi === q.correctIndex;
              return (
                `<div class="o${correct ? " c" : ""}">` +
                `<span class="l">${letter(oi)}</span><span class="otext">${mathToHtml(opt)}</span>` +
                `${correct ? '<span class="mk">✓ Σωστή</span>' : ""}</div>`
              );
            })
            .join("");
          return (
            `<div class="item print-item">` +
            questionRow(qi + 1, q.question, DIFFICULTY_LABEL[q.difficulty]) +
            `<div class="opts">${opts}</div>` +
            `<p class="ex">${mathToHtml(q.explanations[q.correctIndex] ?? "")}</p></div>`
          );
        })
        .join("");
      return (
        titleHtml(
          material.title,
          `${material.questions.length} ερωτήσεις · η σωστή επιλογή είναι σημειωμένη με ✓ και ακολουθεί η εξήγησή της`,
        ) + qs
      );
    }

    case "truefalse": {
      const qs = material.questions
        .map(
          (q, qi) =>
            `<div class="item print-item">` +
            questionRow(qi + 1, q.statement, DIFFICULTY_LABEL[q.difficulty]) +
            `<p class="tfa">Απάντηση: ${q.answer ? "Σωστό" : "Λάθος"}</p>` +
            `<p class="ex">${mathToHtml(q.explanation)}</p></div>`,
        )
        .join("");
      return (
        titleHtml(
          material.title,
          `${material.questions.length} δηλώσεις · με απάντηση και εξήγηση`,
        ) + qs
      );
    }

    case "flashcards": {
      const rows = material.cards
        .map(
          (c, ci) =>
            `<tr class="print-item"><td class="n">${ci + 1}</td>` +
            `<td class="f">${mathToHtml(c.front)}</td><td>${mathToHtml(c.back)}</td></tr>`,
        )
        .join("");
      return (
        titleHtml(
          material.title,
          `${material.cards.length} κάρτες · μπροστινή και πίσω όψη`,
        ) +
        `<table class="cards"><thead><tr><th>#</th><th>Μπροστινή όψη</th><th>Πίσω όψη</th></tr></thead>` +
        `<tbody>${rows}</tbody></table>`
      );
    }
  }
}

function printCss(label: string): string {
  // Printed by the browser where supported (Chromium 131+); ignored elsewhere.
  const footerLabel = `StudyArc · ${label}`.replace(/"/g, '\\"');
  return `
@page {
  size: A4;
  margin: 15mm 17mm;
  @bottom-left { content: "${footerLabel}"; font: 10px Inter, "Segoe UI", sans-serif; color: #71717a; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 10px Inter, "Segoe UI", sans-serif; color: #71717a; }
}
* { box-sizing: border-box; }
html, body { background: #fff; }
body { font-family: Inter, "Segoe UI", system-ui, sans-serif; color: #09090b; font-size: 13px; line-height: 19px; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, p, ul { margin: 0; }
.ph { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid #09090b; margin-bottom: 20px; }
.ph .b { font-size: 14px; font-weight: 600; }
.ph .r { text-align: right; font-size: 11px; line-height: 16px; color: #52525b; }
.ph .r strong { color: #09090b; font-weight: 600; }
.title { margin-bottom: 20px; }
.pt { font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
.pmeta { font-size: 11px; line-height: 16px; color: #52525b; margin-top: 2px; }
h2 { font-size: 14px; line-height: 20px; font-weight: 600; margin: 0 0 6px; }
section { margin-bottom: 18px; }
section > p { margin-bottom: 8px; }
.t { white-space: pre-wrap; }
b { font-weight: 600; }
ul { padding-left: 20px; }
li { margin: 4px 0; }
.formula { background: #f4f4f5; border-radius: 4px; padding: 8px 12px; margin: 8px 0; }
.fexp { color: #52525b; font-size: 12px; line-height: 18px; margin-top: 4px; }
.item { border: 1px solid #d4d4d8; border-radius: 6px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.qrow { display: flex; gap: 8px; align-items: flex-start; }
.qrow .n { font-weight: 600; color: #52525b; flex: none; }
.qrow .q { font-weight: 500; flex: 1; min-width: 0; }
.diff { font-size: 10px; line-height: 14px; color: #52525b; border: 1px solid #d4d4d8; border-radius: 4px; padding: 1px 6px; flex: none; }
.opts { display: flex; flex-direction: column; gap: 4px; padding-left: 20px; }
.o { display: flex; gap: 8px; align-items: center; color: #3f3f46; }
.o .l { width: 18px; height: 18px; border: 1px solid #a1a1aa; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex: none; }
.o.c { color: #09090b; font-weight: 600; }
.o.c .l { background: #09090b; border-color: #09090b; color: #fff; }
.mk { font-size: 11px; font-weight: 600; margin-left: 4px; flex: none; }
.ex { background: #f4f4f5; border-radius: 4px; padding: 8px 12px; font-size: 12px; line-height: 18px; color: #27272a; margin-left: 20px; }
.tfa { padding-left: 20px; font-weight: 600; }
.cards { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; }
.cards thead { display: table-header-group; }
.cards th { text-align: left; font-size: 11px; font-weight: 600; color: #52525b; padding: 6px 10px; border-bottom: 1px solid #09090b; }
.cards td { vertical-align: top; padding: 10px; border-bottom: 1px solid #d4d4d8; }
.cards td.n { width: 28px; font-weight: 600; color: #52525b; padding-right: 0; }
.cards td.f { width: 44%; font-weight: 500; }
.print-item { break-inside: avoid; page-break-inside: avoid; }
.katex { font-size: 1.04em; color: inherit; }
.katex-display { margin: 6px 0; text-align: left; }
.katex-display > .katex { text-align: left; }
`;
}

function buildPrintDoc(material: GeneratedMaterial, fileName: string): string {
  const label = MODE_LABEL[material.mode];
  const now = new Date();
  const date =
    `${String(now.getDate()).padStart(2, "0")}/` +
    `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  // Print after the KaTeX fonts have settled so math glyphs aren't missing.
  const printScript =
    `window.onload=function(){var go=function(){try{window.focus();window.print();}catch(e){}};` +
    `if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(go,60);});}` +
    `else{setTimeout(go,300);}};`;
  return (
    `<!doctype html><html lang="el"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(fileName)} — ${label}</title>` +
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">` +
    `<style>${printCss(label)}</style></head><body>` +
    `<header class="ph"><span class="b">StudyArc</span>` +
    `<span class="r"><strong>${label}</strong><br>${escapeHtml(fileName)}<br>${date}</span></header>` +
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
