/**
 * Parse an SOP body into ordered, runnable steps.
 * Detects "Step N", "N.", "N)", or bullet markers; falls back to paragraphs.
 */
export function parseSopSteps(body: string): string[] {
  const isStep = (l: string) => /^\s*(step\s*\d+|\d+[.)\]:]|[-*•])\s+/i.test(l);
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
