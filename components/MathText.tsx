import katex from "katex";
import { punctuationToKeep } from "@/lib/study";

type Part = {
  type: "text" | "math";
  value: string;
  display?: boolean;
  /** Punctuation that must stay on the same line as this formula. */
  keep?: string;
};

/** Split text into plain and math segments ($$...$$ display, $...$ inline). */
function parse(text: string): Part[] {
  const parts: Part[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (value: string) => {
    const prev = parts[parts.length - 1];
    if (prev?.type === "math" && !prev.display) {
      prev.keep = punctuationToKeep(prev.value, value);
      value = value.slice(prev.keep.length);
    }
    if (value) parts.push({ type: "text", value });
  };
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push({ type: "math", value: m[1], display: true });
    else parts.push({ type: "math", value: m[2] ?? "", display: false });
    last = re.lastIndex;
  }
  if (last < text.length) pushText(text.slice(last));
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
      {parse(text).map((p, i) => {
        if (p.type === "text") {
          return (
            <span key={i} style={{ whiteSpace: "pre-wrap" }}>
              {p.value}
            </span>
          );
        }
        const math = (
          <span dangerouslySetInnerHTML={{ __html: toHtml(p.value, !!p.display) }} />
        );
        return p.keep ? (
          <span key={i} style={{ whiteSpace: "nowrap" }}>
            {math}
            {p.keep}
          </span>
        ) : (
          <span key={i}>{math}</span>
        );
      })}
    </>
  );
}
