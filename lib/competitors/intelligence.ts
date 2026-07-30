import { z } from "zod";
import type {
  ContentMarketIntelligenceProvenance,
} from "@/types/content";

export const INTELLIGENCE_SCHEMA_VERSION = 2 as const;

const concise = z.string().trim().min(1).max(1200);
const shortList = z.array(z.string().trim().min(1).max(240)).max(10);
const sourceIds = z.array(z.string().uuid()).min(1).max(12);
const multiSourceIds = z.array(z.string().uuid()).min(2).max(12);
const competitorIds = z.array(z.string().uuid()).min(1).max(12);
const companyReferenceIds = z.array(z.string().uuid()).max(12);
const evidenceQuotes = z.array(z.object({
  source_item_id: z.string().uuid(),
  quote: z.string().trim().min(20).max(500),
})).min(1).max(12);
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
    evidence_quotes: evidenceQuotes.min(2),
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
    evidence_quotes: evidenceQuotes.min(2),
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
    evidence_quotes: evidenceQuotes,
  })).min(1).max(20),
  comparisons: z.array(z.object({
    dimension: z.string().trim().min(1).max(120),
    observations: z.array(z.object({
      competitor_id: z.string().uuid(),
      value: z.string().trim().min(1).max(500),
    })).min(2).max(20),
    opportunity: concise,
    source_item_ids: multiSourceIds,
    evidence_quotes: evidenceQuotes.min(2),
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
    evidence_quotes: evidenceQuotes.min(2),
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
    evidence_quotes: evidenceQuotes.min(2),
    company_reference_ids: companyReferenceIds,
    novelty: z.enum(["new", "adjacent", "overlap"]),
    overlap_warning: z.string().trim().max(600),
    confidence: z.enum(["low", "medium", "high"]),
  })).min(1).max(12),
});

export type CompetitorIntelligence = z.infer<typeof competitorIntelligenceSchema>;
export type CompetitorIntelligenceIdea = CompetitorIntelligence["recommended_ideas"][number];

export interface CompetitorIntelligenceSource {
  id: string;
  capture_version_id: string;
  content_hash: string;
  competitor_id: string;
  competitor_name: string;
  title: string;
  url: string;
  platform: string;
  content_type: string;
  published_at: string | null;
  captured_at: string;
  effective_at: string;
  date_basis: "published" | "captured";
}

export interface CompetitorIntelligenceCompanySource {
  id: string;
  kind: "content_piece" | "vault_item";
  title: string;
  excerpt: string;
  content_hash: string;
}

export interface CompetitorIntelligenceJob {
  id: string;
  status: "running";
  started_at: string;
  lease_until: string;
}

export interface CompetitorIntelligenceRun {
  id: string;
  client_id: string;
  status: "complete" | "superseded";
  job_id: string;
  schema_version: 2;
  window_start: string;
  window_end: string;
  competitor_ids: string[];
  source_item_ids: string[];
  source_count: number;
  source_character_count: number;
  fallback_date_count: number;
  analysis: CompetitorIntelligence;
  model: string;
  created_at: string;
  updated_at: string;
  sources: CompetitorIntelligenceSource[];
  company_sources: CompetitorIntelligenceCompanySource[];
}

export type CompetitorIdeaBriefResult =
  | {
      ok: true;
      brief: {
        type: CompetitorIntelligenceIdea["channel"];
        title: string;
        objective: string;
        keyPoints: string[];
        additionalGuidance: string;
        marketIntelligence: ContentMarketIntelligenceProvenance;
      };
    }
  | { ok: false; error: string };

export function parseCompetitorIntelligence(value: unknown): CompetitorIntelligence | null {
  const parsed = competitorIntelligenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function competitorIdeaToBrief(
  idea: CompetitorIntelligenceIdea,
  run: CompetitorIntelligenceRun,
): CompetitorIdeaBriefResult {
  const quoteBySource = new Map(
    idea.evidence_quotes.map((evidence) => [evidence.source_item_id, evidence.quote]),
  );
  const selectedSources = run.sources.filter((source) =>
    idea.source_item_ids.includes(source.id));
  const selectedCompanySources = run.company_sources.filter((source) =>
    idea.company_reference_ids.includes(source.id));
  if (
    selectedSources.length !== idea.source_item_ids.length ||
    selectedSources.some((source) => (quoteBySource.get(source.id)?.trim().length ?? 0) < 20)
  ) {
    return {
      ok: false,
      error: "This idea's immutable competitor evidence is incomplete. Refresh the intelligence report.",
    };
  }
  if (selectedCompanySources.length !== idea.company_reference_ids.length) {
    return {
      ok: false,
      error: "This idea's company comparison evidence is incomplete. Refresh the intelligence report.",
    };
  }
  return {
    ok: true,
    brief: {
      type: idea.channel,
      title: idea.title,
      objective: idea.objective,
      keyPoints: idea.key_points,
      additionalGuidance: [
        `Market opportunity: ${idea.why_valuable}`,
        `Differentiated angle: ${idea.differentiation}`,
        `Suggested opening: ${idea.suggested_hook}`,
        `Novelty assessment: ${idea.novelty}.`,
        idea.overlap_warning ? `Overlap note: ${idea.overlap_warning}` : "",
        "Competitor intelligence is market inspiration only. Verify every factual claim using the company Vault.",
      ].filter(Boolean).join("\n"),
      marketIntelligence: {
        version: 1,
        runId: run.id,
        reportSchemaVersion: 2,
        ideaTitle: idea.title,
        whyValuable: idea.why_valuable,
        differentiation: idea.differentiation,
        confidence: idea.confidence,
        novelty: idea.novelty,
        competitorIds: idea.competitor_ids,
        competitorSources: selectedSources.map((source) => ({
          itemId: source.id,
          captureVersionId: source.capture_version_id,
          contentHash: source.content_hash,
          competitorId: source.competitor_id,
          competitorName: source.competitor_name,
          title: source.title,
          url: source.url,
          effectiveAt: source.effective_at,
          dateBasis: source.date_basis,
          evidenceQuote: quoteBySource.get(source.id)!.trim(),
        })),
        companyReferences: selectedCompanySources.map((source) => ({
          id: source.id,
          kind: source.kind,
          title: source.title,
          contentHash: source.content_hash,
        })),
        generatedAt: run.created_at,
      },
    },
  };
}
