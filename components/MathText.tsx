import katex from "katex";

type Part = { type: "text" | "math"; value: string; display?: boolean };

/** Split text into plain and math segments ($$...$$ display, $...$ inline). */
function parse(text: string): Part[] {
  const parts: Part[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) parts.push({ type: "math", value: m[1], display: true });
    else parts.push({ type: "math", value: m[2] ?? "", display: false });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

function toHtml(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      output: "htmlAndMathml",
    });
  } catch {
    return "";
  }
}

/**
 * Render model text with embedded LaTeX. KaTeX output is deterministic and the
 * input is our own server-validated material, so dangerouslySetInnerHTML is safe.
 */
export function MathText({ text }: { text: string }) {
  return (
    <>
      {parse(text).map((p, i) =>
        p.type === "text" ? (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>
            {p.value}
          </span>
        ) : (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: toHtml(p.value, !!p.display) }}
          />
        ),
      )}
    </>
  );
}
