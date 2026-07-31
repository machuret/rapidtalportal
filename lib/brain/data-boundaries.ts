/**
 * Canonical Brain data boundaries. This is product policy as code: Phase 1
 * resolvers and tests use it to prevent facts, style, learning and competitor
 * inspiration from silently bleeding into one another.
 */
export const BRAIN_DATA_BOUNDARIES = {
  company_identity: {
    label: "Company identity",
    systemOfRecord: "company_dna",
    use: "Company identity, audience, services, goals and declared positioning.",
    allowedContextSections: ["company"],
    prohibitedUses: ["competitor_inspiration", "learned_preference"],
  },
  company_knowledge: {
    label: "Company knowledge",
    systemOfRecord: "vault_items",
    use: "Relevant company information retrieved for an answer or content task.",
    allowedContextSections: ["knowledge"],
    prohibitedUses: ["owned_style", "competitor_inspiration"],
  },
  owned_style: {
    label: "Owned writing style",
    systemOfRecord: "content_style_analyses",
    use: "Approved voice and channel-specific writing instructions derived from owned examples.",
    allowedContextSections: ["style"],
    prohibitedUses: ["company_knowledge", "competitor_inspiration"],
  },
  editorial_rules: {
    label: "Editorial rules",
    systemOfRecord: "company_dna.hard_rules",
    use: "Structured, deterministically enforceable content constraints.",
    allowedContextSections: ["style"],
    prohibitedUses: ["company_knowledge", "competitor_inspiration"],
  },
  editorial_learning: {
    label: "Editorial learning",
    systemOfRecord: "brain_memory",
    use: "Approved preferences, anti-patterns and rules learned from deliberate feedback.",
    allowedContextSections: ["memories"],
    prohibitedUses: ["company_knowledge", "published_performance"],
  },
  market_intelligence: {
    label: "Market intelligence",
    systemOfRecord: "competitor_intelligence_runs",
    use: "Versioned competitor and market inspiration for analysis, ideation and differentiation.",
    allowedContextSections: ["market"],
    prohibitedUses: ["company_knowledge", "owned_style"],
  },
  feedback_signals: {
    label: "Explicit feedback",
    systemOfRecord: "brain_signals",
    use: "Human judgements that can support proposed editorial lessons.",
    allowedContextSections: [],
    prohibitedUses: ["company_knowledge", "direct_prompt_injection"],
  },
  published_performance: {
    label: "Published performance",
    systemOfRecord: "content_outcomes",
    use: "Reporting only.",
    allowedContextSections: [],
    prohibitedUses: ["brain_learning", "style_learning", "memory_reinforcement"],
  },
} as const;

export type BrainDataBoundary = keyof typeof BRAIN_DATA_BOUNDARIES;

export const BRAIN_CONTEXT_SECTION_BOUNDARIES = {
  company: ["company_identity"],
  knowledge: ["company_knowledge"],
  style: ["owned_style", "editorial_rules"],
  memories: ["editorial_learning"],
  market: ["market_intelligence"],
} as const satisfies Record<string, readonly BrainDataBoundary[]>;

export function boundaryAllowsSection(
  boundary: BrainDataBoundary,
  section: keyof typeof BRAIN_CONTEXT_SECTION_BOUNDARIES,
): boolean {
  return (BRAIN_CONTEXT_SECTION_BOUNDARIES[section] as readonly BrainDataBoundary[])
    .includes(boundary);
}
