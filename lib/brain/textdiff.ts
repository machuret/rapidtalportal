/**
 * Cheap text-similarity for measuring how much a human rewrote an AI draft
 * before approving it. Word-set Jaccard: 1.0 = identical wording, ~0 = rewritten
 * from scratch. Fast and good enough to bucket "kept" vs "rewritten" on bodies
 * that can run to thousands of characters (avoids O(n·m) edit distance).
 */
function tokenSet(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter((w) => w.length > 1),
  );
}

export function similarityRatio(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  return inter / (ta.size + tb.size - inter);
}
