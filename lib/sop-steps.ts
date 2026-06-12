/**
 * Parse an SOP body into ordered, runnable steps.
 * Detects "Step N", "N.", "N)", or bullet markers; falls back to paragraphs.
 */
export interface SopStep { title: string; detail: string; tip?: string }

/**
 * Serialize structured steps back into the body text the runner + detail view
 * already understand ("Step N: title" blocks). Intro and prerequisites are
 * written as a preamble WITHOUT bullet markers so they don't get parsed as
 * steps. Keeps structured SOPs fully backward-compatible.
 */
export function serializeSteps(intro: string, prerequisites: string[], steps: SopStep[]): string {
  const parts: string[] = [];
  if (intro.trim()) parts.push(intro.trim());
  const prereqs = prerequisites.map((p) => p.trim()).filter(Boolean);
  if (prereqs.length) parts.push(`Before you start: ${prereqs.join("; ")}`);
  steps.forEach((s, i) => {
    let block = `Step ${i + 1}: ${s.title.trim()}`;
    if (s.detail.trim()) block += `\n${s.detail.trim()}`;
    if (s.tip?.trim()) block += `\nTip: ${s.tip.trim()}`;
    parts.push(block);
  });
  return parts.join("\n\n");
}

export function parseSopSteps(body: string): string[] {
  // A line starts a step if it opens with "Step N", "N.", "N)", "N:" or a
  // bullet. The "step" branch allows trailing punctuation ("Step 1:") so the
  // parser recognises exactly what serializeSteps() writes — otherwise those
  // headers leak into the displayed step text.
  const isStep = (l: string) => /^\s*(step\s*\d+[:.)\]]*|\d+[.)\]:]|[-*•])\s+/i.test(l);
  const strip = (l: string) => l.replace(/^\s*(step\s*\d+[:.)\]]*|\d+[.)\]:]+|[-*•])\s*/i, "").trim();

  const steps: string[] = [];
  let current: string | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (isStep(line)) {
      if (current) steps.push(current.trim());
      current = strip(line);
    } else if (current !== null) {
      current += "\n" + line.trim();
    } else {
      current = line.trim();
    }
  }
  if (current) steps.push(current.trim());

  // No explicit markers → try paragraphs so it's still runnable.
  if (steps.length <= 1) {
    const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paras.length > 1) return paras;
  }
  return steps.filter(Boolean);
}
