export interface CompetitorContextProfile {
  id: string;
  name: string;
}

const COMPETITOR_INTENT =
  /\b(competitors?|competitive|competition|rivals?|market\s+(?:landscape|players?|positioning))\b/iu;

/**
 * Competitor context is opt-in. It is selected only when the question
 * explicitly asks about the competitive market or names a saved competitor.
 * Recent conversation can be included in `query` so follow-up questions keep
 * their market context.
 */
export function resolveCompetitorTargets<T extends CompetitorContextProfile>(
  query: string,
  competitors: T[],
): { explicitIntent: boolean; named: T[]; targets: T[] } {
  const lowerQuery = query.toLowerCase();
  const named = competitors.filter((competitor) => {
    const name = competitor.name.trim().toLowerCase();
    return name.length >= 3 && lowerQuery.includes(name);
  });
  const explicitIntent = COMPETITOR_INTENT.test(query);
  return {
    explicitIntent,
    named,
    targets: named.length ? named : explicitIntent ? competitors : [],
  };
}
