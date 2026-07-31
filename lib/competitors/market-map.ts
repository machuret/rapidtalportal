import type {
  CompetitorIntelligence,
} from "@/lib/competitors/intelligence";

export interface MarketMapEvidence {
  id: string;
  competitor_id: string;
  raw_content: string;
  effective_at: string;
  date_basis: "published" | "captured";
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "before",
  "being", "but", "can", "company", "content", "could", "for", "from", "have",
  "into", "more", "our", "that", "the", "their", "this", "those", "through",
  "using", "was", "were", "will", "with", "would", "your",
]);

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function evidenceConfidence(
  sourceIds: string[],
  sourceById: Map<string, MarketMapEvidence>,
): "low" | "medium" | "high" {
  const sources = sourceIds.flatMap((id) => {
    const source = sourceById.get(id);
    return source ? [source] : [];
  });
  const competitors = new Set(sources.map((source) => source.competitor_id)).size;
  const dated = sources.filter((source) => source.date_basis === "published").length;
  if (sources.length >= 5 && dated >= 3 && (competitors >= 2 || sources.length >= 7)) {
    return "high";
  }
  if (sources.length >= 3 && (dated >= 2 || competitors >= 2)) return "medium";
  return "low";
}

function companyStrength(count: number): "none" | "weak" | "partial" | "strong" {
  if (count >= 3) return "strong";
  if (count === 2) return "partial";
  if (count === 1) return "weak";
  return "none";
}

function currentOpportunity(
  sourceIds: string[],
  sourceById: Map<string, MarketMapEvidence>,
  windowEnd: string,
): boolean {
  const cutoff = new Date(windowEnd).getTime() - 45 * 86_400_000;
  return sourceIds.some((id) => {
    const timestamp = Date.parse(sourceById.get(id)?.effective_at ?? "");
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
}

function normalizedAudience(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function recurringVocabulary(
  evidence: MarketMapEvidence[],
): Array<{
  term: string;
  competitor_ids: string[];
  source_item_ids: string[];
}> {
  const occurrences = new Map<string, {
    display: string;
    sourceIds: Set<string>;
    competitorIds: Set<string>;
  }>();
  for (const source of evidence) {
    const terms = unique(
      (source.raw_content.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{2,}/gu) ?? [])
        .map((term) => term.replace(/[’]/gu, "'"))
        .filter((term) => term.length >= 4 && !STOP_WORDS.has(term)),
    );
    for (const term of terms) {
      const record = occurrences.get(term) ?? {
        display: term,
        sourceIds: new Set<string>(),
        competitorIds: new Set<string>(),
      };
      record.sourceIds.add(source.id);
      record.competitorIds.add(source.competitor_id);
      occurrences.set(term, record);
    }
  }
  return [...occurrences.values()]
    .filter((entry) => entry.sourceIds.size >= 2)
    .sort((left, right) =>
      right.competitorIds.size - left.competitorIds.size ||
      right.sourceIds.size - left.sourceIds.size ||
      left.display.localeCompare(right.display))
    .slice(0, 15)
    .map((entry) => ({
      term: entry.display,
      competitor_ids: [...entry.competitorIds],
      source_item_ids: [...entry.sourceIds].slice(0, 12),
    }));
}

/**
 * Build the cross-competitor market model from already verified insights and
 * immutable capture versions. No model-provided confidence or ownership score
 * is trusted: all of it is derived from the linked evidence.
 */
export function buildCompetitorMarketModel(args: {
  analysis: CompetitorIntelligence;
  evidence: MarketMapEvidence[];
  windowEnd: string;
}): CompetitorIntelligence {
  const sourceById = new Map(args.evidence.map((source) => [source.id, source]));
  const withConfidence = {
    ...args.analysis,
    topic_clusters: args.analysis.topic_clusters.map((entry) => ({
      ...entry,
      confidence: evidenceConfidence(entry.source_item_ids, sourceById),
    })),
    format_patterns: args.analysis.format_patterns.map((entry) => ({
      ...entry,
      confidence: evidenceConfidence(entry.source_item_ids, sourceById),
    })),
    positioning_profiles: args.analysis.positioning_profiles.map((entry) => ({
      ...entry,
      confidence: evidenceConfidence(entry.source_item_ids, sourceById),
    })),
    comparisons: args.analysis.comparisons.map((entry) => ({
      ...entry,
      confidence: evidenceConfidence(entry.source_item_ids, sourceById),
    })),
    positioning_gaps: args.analysis.positioning_gaps.map((entry) => ({
      ...entry,
      confidence: evidenceConfidence(entry.source_item_ids, sourceById),
    })),
    recommended_ideas: args.analysis.recommended_ideas.map((entry) => ({
      ...entry,
      confidence: evidenceConfidence(entry.source_item_ids, sourceById),
      market_confidence: evidenceConfidence(entry.source_item_ids, sourceById),
      company_evidence_strength: companyStrength(entry.company_reference_ids.length),
      company_relevance: entry.company_relevance ?? entry.objective,
      difference_from_company_content: entry.difference_from_company_content ??
        (entry.overlap_warning ||
          `Compared with ${entry.company_reference_ids.length} company content or Vault reference${entry.company_reference_ids.length === 1 ? "" : "s"}; no close overlap was identified.`),
      opportunity_horizon: currentOpportunity(
        entry.source_item_ids,
        sourceById,
        args.windowEnd,
      ) ? "current" as const : "evergreen" as const,
    })),
  };

  const topicOwnership = withConfidence.topic_clusters.flatMap((cluster) => {
    const counts = new Map<string, string[]>();
    for (const sourceId of cluster.source_item_ids) {
      const competitorId = sourceById.get(sourceId)?.competitor_id;
      if (!competitorId) continue;
      counts.set(competitorId, [...(counts.get(competitorId) ?? []), sourceId]);
    }
    return [...counts.entries()].map(([competitorId, sourceIds]) => ({
      topic_cluster_id: cluster.id,
      competitor_id: competitorId,
      source_share: Math.round((sourceIds.length / cluster.source_item_ids.length) * 100),
      source_item_ids: sourceIds,
    }));
  });

  const audienceGroups = new Map<string, {
    label: string;
    competitorIds: Set<string>;
    sourceIds: Set<string>;
  }>();
  for (const profile of withConfidence.positioning_profiles) {
    for (const audience of profile.audience) {
      const key = normalizedAudience(audience);
      const group = audienceGroups.get(key) ?? {
        label: audience.trim(),
        competitorIds: new Set<string>(),
        sourceIds: new Set<string>(),
      };
      group.competitorIds.add(profile.competitor_id);
      profile.source_item_ids.forEach((id) => group.sourceIds.add(id));
      audienceGroups.set(key, group);
    }
  }

  const strategicRecommendations = [
    ...withConfidence.recommended_ideas.map((idea) => ({
      title: idea.title,
      recommendation: idea.differentiation,
      rationale: idea.why_valuable,
      opportunity_horizon: idea.opportunity_horizon,
      competitor_ids: idea.competitor_ids,
      source_item_ids: idea.source_item_ids,
      company_reference_ids: idea.company_reference_ids,
      market_confidence: idea.market_confidence,
      company_evidence_strength: idea.company_evidence_strength,
    })),
    ...withConfidence.positioning_gaps.map((gap) => ({
      title: gap.title,
      recommendation: gap.suggested_angles.join(" · ") || gap.description,
      rationale: gap.rationale,
      opportunity_horizon: currentOpportunity(
        gap.source_item_ids,
        sourceById,
        args.windowEnd,
      ) ? "current" as const : "evergreen" as const,
      competitor_ids: gap.competitor_ids,
      source_item_ids: gap.source_item_ids,
      company_reference_ids: [],
      market_confidence: gap.confidence ?? "low",
      company_evidence_strength: "none" as const,
    })),
  ].slice(0, 10);
  const recentCutoff = new Date(args.windowEnd).getTime() - 45 * 86_400_000;
  const recentChanges = withConfidence.topic_clusters.flatMap((cluster) => {
    const recentIds = cluster.source_item_ids.filter((id) => {
      const timestamp = Date.parse(sourceById.get(id)?.effective_at ?? "");
      return Number.isFinite(timestamp) && timestamp >= recentCutoff;
    });
    if (!recentIds.length) return [];
    const olderCount = cluster.source_item_ids.length - recentIds.length;
    const kind = olderCount === 0
      ? "new_activity" as const
      : recentIds.length > olderCount
        ? "accelerating_activity" as const
        : "continued_activity" as const;
    return [{
      kind,
      label: cluster.label,
      summary: kind === "new_activity"
        ? `${cluster.label} appears only in captures from the most recent 45 days of this report.`
        : kind === "accelerating_activity"
          ? `${cluster.label} has more verified captures in the most recent 45 days than earlier in the report window.`
          : `${cluster.label} continues to appear in recent and earlier captures.`,
      competitor_ids: unique(recentIds.flatMap((id) => {
        const competitorId = sourceById.get(id)?.competitor_id;
        return competitorId ? [competitorId] : [];
      })),
      source_item_ids: recentIds,
      confidence: evidenceConfidence(cluster.source_item_ids, sourceById),
    }];
  });

  return {
    ...withConfidence,
    market_map: {
      topic_ownership: topicOwnership,
      shared_narratives: withConfidence.topic_clusters
        .filter((cluster) => cluster.competitor_ids.length >= 2)
        .map((cluster) => ({
          topic_cluster_id: cluster.id,
          label: cluster.label,
          competitor_ids: cluster.competitor_ids,
          source_item_ids: cluster.source_item_ids,
          confidence: cluster.confidence ?? "low",
        })),
      audience_segments: [...audienceGroups.values()]
        .sort((left, right) => right.competitorIds.size - left.competitorIds.size)
        .slice(0, 15)
        .map((group) => ({
          label: group.label,
          competitor_ids: [...group.competitorIds],
          source_item_ids: [...group.sourceIds].slice(0, 12),
        })),
      cta_patterns: withConfidence.format_patterns
        .filter((format) => format.cta_pattern.trim())
        .map((format) => ({
          label: format.cta_pattern,
          competitor_ids: format.competitor_ids,
          source_item_ids: format.source_item_ids,
        })),
      recurring_vocabulary: recurringVocabulary(args.evidence),
      recent_changes: recentChanges,
      saturated_topics: withConfidence.topic_clusters
        .filter((cluster) =>
          cluster.competitor_ids.length >= 3 || cluster.source_item_ids.length >= 5)
        .map((cluster) => ({
          topic_cluster_id: cluster.id,
          label: cluster.label,
          competitor_ids: cluster.competitor_ids,
          source_item_ids: cluster.source_item_ids,
          reason: `${cluster.source_item_ids.length} verified captures across ${cluster.competitor_ids.length} competitor${cluster.competitor_ids.length === 1 ? "" : "s"} already cover this narrative.`,
        })),
      weakly_covered_topics: withConfidence.positioning_gaps
        .filter((gap) => gap.gap_type === "topic" || gap.gap_type === "audience")
        .map((gap) => ({
          label: gap.title,
          competitor_ids: gap.competitor_ids,
          source_item_ids: gap.source_item_ids,
          opportunity: gap.description,
        })),
      strategic_recommendations: strategicRecommendations,
    },
  };
}
