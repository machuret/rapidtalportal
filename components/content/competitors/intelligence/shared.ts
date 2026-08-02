import type { CompetitorIntelligenceSource } from "@/lib/competitors/intelligence";
import type { Competitor } from "@/types/competitors";

/** Lookup maps shared by the report sections. */
export type SourceById = ReadonlyMap<string, CompetitorIntelligenceSource>;
export type CompetitorById = ReadonlyMap<string, Competitor>;

export const EMPTY_MARKET_MAP = {
  topic_ownership: [],
  shared_narratives: [],
  audience_segments: [],
  cta_patterns: [],
  recurring_vocabulary: [],
  recent_changes: [],
  saturated_topics: [],
  weakly_covered_topics: [],
  strategic_recommendations: [],
} as const;

export function readableDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
