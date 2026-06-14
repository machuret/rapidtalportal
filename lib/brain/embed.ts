/**
 * Lightweight embedding utilities for the Brain's fit scoring (Phase 4).
 *
 * The Vault uses gte-small (384-dim) inside the edge runtime; here in Node we
 * use OpenAI embeddings purely to score how well a *candidate* topic resembles
 * what this client has APPROVED vs what they've REJECTED. Because every text in
 * a scoring pass is embedded with the same model in the same request, the space
 * is self-consistent — we don't mix it with the Vault's gte-small vectors.
 *
 * This grounds the auto-flag in the client's real acceptance history, not just
 * the model's self-assessment.
 */
const EMBED_MODEL = process.env.BRAIN_EMBED_MODEL ?? "text-embedding-3-small";

/** Embed a batch of texts. Returns vectors in input order, or null on failure. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || texts.length === 0) return null;
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts.map((t) => t.slice(0, 2000)) }),
    });
  } catch (e) {
    console.error("[brain/embed] fetch error", e);
    return null;
  }
  if (!res.ok) {
    console.error("[brain/embed] OpenAI error", res.status);
    return null;
  }
  const json = await res.json();
  const data = json.data as { index: number; embedding: number[] }[] | undefined;
  if (!Array.isArray(data)) return null;
  return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function centroid(vecs: number[][]): number[] | null {
  if (vecs.length === 0) return null;
  const dim = vecs[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vecs.length;
  return out;
}

const MIN_REFS = 3; // need at least this many examples on a side to trust it

/**
 * Score each candidate 0-100 for how well it fits this client's taste, using
 * approved examples (attract) and rejected/flagged examples (repel). Returns an
 * array aligned to `candidates`, or null if there isn't enough history to score.
 */
export async function embeddingFit(opts: {
  positives: string[];
  negatives: string[];
  candidates: string[];
}): Promise<(number | null)[] | null> {
  const { positives, negatives, candidates } = opts;
  if (candidates.length === 0) return null;
  const hasPos = positives.length >= MIN_REFS;
  const hasNeg = negatives.length >= MIN_REFS;
  if (!hasPos && !hasNeg) return null; // nothing to compare against yet

  const usePos = hasPos ? positives : [];
  const useNeg = hasNeg ? negatives : [];
  const all = [...candidates, ...usePos, ...useNeg];
  const vecs = await embedTexts(all);
  if (!vecs) return null;

  const cand = vecs.slice(0, candidates.length);
  const posVecs = vecs.slice(candidates.length, candidates.length + usePos.length);
  const negVecs = vecs.slice(candidates.length + usePos.length);

  const posC = centroid(posVecs);
  const negC = centroid(negVecs);

  return cand.map((c) => {
    const rel = posC ? cosine(c, posC) : null;  // similarity to "good" (-1..1)
    const anti = negC ? cosine(c, negC) : null; // similarity to "bad"  (-1..1)
    let score: number;
    if (rel !== null && anti !== null) {
      // Reward closeness to good, penalise closeness to bad.
      score = 50 + 50 * (rel - anti);
    } else if (rel !== null) {
      score = ((rel + 1) / 2) * 100;
    } else if (anti !== null) {
      score = (1 - (anti + 1) / 2) * 100;
    } else {
      return null;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  });
}
