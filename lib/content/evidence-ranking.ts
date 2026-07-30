const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between",
  "company", "could", "create", "draft", "from", "have", "into", "more", "most",
  "only", "other", "should", "that", "their", "there", "these", "they", "this",
  "through", "using", "what", "when", "where", "which", "while", "with", "would",
]);

function terms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
}

export interface EvidenceCandidate {
  title: string;
  ai_summary: string | null;
  raw_content: string | null;
}

/**
 * Deterministically ranks ready factual sources against the editor's topic.
 * The Edge Function still performs semantic retrieval inside this shortlist;
 * this prevents Quick Create from treating "newest" as "most relevant".
 */
export function rankEvidenceCandidates<T extends EvidenceCandidate>(
  query: string,
  candidates: T[],
): T[] {
  const queryTerms = [...new Set(terms(query))];
  if (queryTerms.length === 0) return candidates;

  return candidates
    .map((candidate, index) => {
      const titleTerms = new Set(terms(candidate.title));
      const summaryTerms = new Set(terms(candidate.ai_summary ?? ""));
      const bodyTerms = new Set(terms((candidate.raw_content ?? "").slice(0, 12_000)));
      const score = queryTerms.reduce((total, term) => (
        total +
        (titleTerms.has(term) ? 5 : 0) +
        (summaryTerms.has(term) ? 2 : 0) +
        (bodyTerms.has(term) ? 1 : 0)
      ), 0) / queryTerms.length;
      return { candidate, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ candidate }) => candidate);
}
