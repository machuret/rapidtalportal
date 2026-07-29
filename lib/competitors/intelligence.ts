import { z } from "zod";

export const INTELLIGENCE_SCHEMA_VERSION = 1 as const;

const concise = z.string().trim().min(1).max(1200);
const shortList = z.array(z.string().trim().min(1).max(240)).max(10);
const sourceIds = z.array(z.string().uuid()).min(1).max(12);
const multiSourceIds = z.array(z.string().uuid()).min(2).max(12);
const competitorIds = z.array(z.string().uuid()).min(1).max(12);
const channels = z.array(z.enum([
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "email",
  "blog",
  "newsletter",
])).min(1).max(7);

export const competitorIntelligenceSchema = z.object({
  schema_version: z.literal(INTELLIGENCE_SCHEMA_VERSION),
  executive_summary: concise,
  topic_clusters: z.array(z.object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,79}$/u),
    label: z.string().trim().min(1).max(120),
    description: concise,
    signal_strength: z.enum(["emerging", "established"]),
    competitor_ids: competitorIds,
    source_item_ids: multiSourceIds,
    channels,
  })).min(1).max(12),
  format_patterns: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    description: concise,
    hook_pattern: z.string().trim().max(400),
    structure_pattern: z.string().trim().max(600),
    cta_pattern: z.string().trim().max(400),
    competitor_ids: competitorIds,
    source_item_ids: multiSourceIds,
    channels,
  })).max(10),
  positioning_profiles: z.array(z.object({
    competitor_id: z.string().uuid(),
    summary: concise,
    audience: shortList,
    themes: shortList,
    value_propositions: shortList,
    tone: shortList,
    source_item_ids: sourceIds,
  })).min(1).max(20),
  comparisons: z.array(z.object({
    dimension: z.string().trim().min(1).max(120),
    observations: z.array(z.object({
      competitor_id: z.string().uuid(),
      value: z.string().trim().min(1).max(500),
    })).min(2).max(20),
    opportunity: concise,
    source_item_ids: multiSourceIds,
  })).max(10),
  positioning_gaps: z.array(z.object({
    title: z.string().trim().min(1).max(180),
    description: concise,
    gap_type: z.enum([
      "topic",
      "audience",
      "format",
      "proof",
      "positioning",
      "counter_position",
    ]),
    rationale: concise,
    company_fit: z.enum(["low", "medium", "high"]),
    competitor_ids: competitorIds,
    source_item_ids: multiSourceIds,
    recommended_channels: channels,
    suggested_angles: shortList,
  })).min(1).max(12),
  recommended_ideas: z.array(z.object({
    title: z.string().trim().min(1).max(220),
    channel: z.enum([
      "linkedin",
      "facebook",
      "instagram",
      "x",
      "email",
      "blog",
      "newsletter",
    ]),
    format: z.string().trim().min(1).max(120),
    objective: concise,
    why_valuable: concise,
    differentiation: concise,
    suggested_hook: z.string().trim().min(1).max(500),
    key_points: shortList.min(2),
    competitor_ids: competitorIds,
    source_item_ids: multiSourceIds,
    confidence: z.enum(["low", "medium", "high"]),
  })).min(1).max(12),
});

export type CompetitorIntelligence = z.infer<typeof competitorIntelligenceSchema>;
export type CompetitorIntelligenceIdea = CompetitorIntelligence["recommended_ideas"][number];

export interface CompetitorIntelligenceSource {
  id: string;
  competitor_id: string;
  competitor_name: string;
  title: string;
  url: string;
  platform: string;
  content_type: string;
  published_at: string | null;
}

export interface CompetitorIntelligenceRun {
  id: string;
  client_id: string;
  status: "complete" | "superseded";
  schema_version: 1;
  window_start: string;
  window_end: string;
  competitor_ids: string[];
  source_item_ids: string[];
  source_count: number;
  source_character_count: number;
  analysis: CompetitorIntelligence;
  model: string;
  created_at: string;
  updated_at: string;
  sources: CompetitorIntelligenceSource[];
}

export function parseCompetitorIntelligence(value: unknown): CompetitorIntelligence | null {
  const parsed = competitorIntelligenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function competitorIdeaToBrief(idea: CompetitorIntelligenceIdea): {
  type: CompetitorIntelligenceIdea["channel"];
  title: string;
  brief: string;
} {
  return {
    type: idea.channel,
    title: idea.title,
    brief: [
      idea.objective,
      `Market opportunity: ${idea.why_valuable}`,
      `Differentiated angle: ${idea.differentiation}`,
      `Suggested opening: ${idea.suggested_hook}`,
      "Key points:",
      ...idea.key_points.map((point) => `- ${point}`),
      "",
      "Competitor intelligence is market inspiration only. Verify every factual claim using the company Vault.",
    ].join("\n"),
  };
}
