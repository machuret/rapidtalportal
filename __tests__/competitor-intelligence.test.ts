/** @jest-environment node */

import {
  competitorIdeaToBrief,
  competitorIntelligenceSchema,
  parseCompetitorIntelligence,
  type CompetitorIntelligenceRun,
} from "@/lib/competitors/intelligence";

const COMPETITOR_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];
const CAPTURE_IDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
];
const COMPANY_ID = "20000000-0000-4000-8000-000000000001";
const RUN_ID = "30000000-0000-4000-8000-000000000001";

test("requires exact evidence quotations for patterns, gaps and recommendations", () => {
  const parsed = competitorIntelligenceSchema.safeParse({
    schema_version: 2,
    executive_summary: "Summary",
    topic_clusters: [{
      id: "cluster",
      label: "Cluster",
      description: "Description",
      signal_strength: "emerging",
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: SOURCE_IDS,
      evidence_quotes: [{ source_item_id: SOURCE_IDS[0], quote: "Only one quote is supplied for two exact sources." }],
      channels: ["linkedin"],
    }],
    format_patterns: [],
    positioning_profiles: [],
    comparisons: [],
    positioning_gaps: [],
    recommended_ideas: [],
  });

  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues.some((issue) =>
      issue.path.join(".") === "topic_clusters.0.evidence_quotes")).toBe(true);
  }
});

test("rejects reports from unsupported schema versions", () => {
  const valid = {
    schema_version: 2 as const,
    executive_summary: "Summary",
    topic_clusters: [{
      id: "cluster",
      label: "Cluster",
      description: "Description",
      signal_strength: "established" as const,
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: SOURCE_IDS,
      evidence_quotes: SOURCE_IDS.map((id) => ({
        source_item_id: id,
        quote: "A sufficiently long exact competitor evidence quote.",
      })),
      channels: ["linkedin" as const],
    }],
    format_patterns: [],
    positioning_profiles: [{
      competitor_id: COMPETITOR_ID,
      summary: "Positioning",
      audience: [],
      themes: [],
      value_propositions: [],
      tone: [],
      source_item_ids: [SOURCE_IDS[0]],
      evidence_quotes: [{
        source_item_id: SOURCE_IDS[0],
        quote: "A sufficiently long exact competitor evidence quote.",
      }],
    }],
    comparisons: [],
    positioning_gaps: [{
      title: "Gap",
      description: "Description",
      gap_type: "topic" as const,
      rationale: "Rationale",
      company_fit: "high" as const,
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: SOURCE_IDS,
      evidence_quotes: SOURCE_IDS.map((id) => ({
        source_item_id: id,
        quote: "A sufficiently long exact competitor evidence quote.",
      })),
      recommended_channels: ["linkedin" as const],
      suggested_angles: [],
    }],
    recommended_ideas: [{
      title: "Idea",
      channel: "linkedin" as const,
      format: "Post",
      objective: "Objective",
      why_valuable: "Value",
      differentiation: "Difference",
      suggested_hook: "Hook",
      key_points: ["One", "Two"],
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: SOURCE_IDS,
      evidence_quotes: SOURCE_IDS.map((id) => ({
        source_item_id: id,
        quote: "A sufficiently long exact competitor evidence quote.",
      })),
      company_reference_ids: [],
      novelty: "new" as const,
      overlap_warning: "",
      confidence: "medium" as const,
    }],
  };
  expect(parseCompetitorIntelligence(valid)).not.toBeNull();
  expect(parseCompetitorIntelligence({ ...valid, schema_version: 1 })).toBeNull();
  expect(parseCompetitorIntelligence({ ...valid, schema_version: 3 })).toBeNull();
});

test("creates a structured brief with immutable market provenance", () => {
  const idea = {
    title: "A practical decision checklist",
    channel: "linkedin" as const,
    format: "Checklist",
    objective: "Help readers make a sound decision.",
    why_valuable: "The market discusses the issue but offers few practical steps.",
    differentiation: "Show a transparent process.",
    suggested_hook: "Most teams do not need another prediction.",
    key_points: ["Define the decision", "Compare the trade-offs"],
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS,
    evidence_quotes: SOURCE_IDS.map((id, index) => ({
      source_item_id: id,
      quote: `Exact verified competitor excerpt number ${index + 1}.`,
    })),
    company_reference_ids: [COMPANY_ID],
    novelty: "adjacent" as const,
    overlap_warning: "The topic exists, but the checklist format is new.",
    confidence: "medium" as const,
  };
  const run = {
    id: RUN_ID,
    job_id: "40000000-0000-4000-8000-000000000001",
    client_id: "50000000-0000-4000-8000-000000000001",
    status: "complete",
    schema_version: 2,
    window_start: "2026-01-01T00:00:00.000Z",
    window_end: "2026-07-01T00:00:00.000Z",
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS,
    source_count: 2,
    source_character_count: 3000,
    fallback_date_count: 0,
    analysis: {
      schema_version: 2,
      executive_summary: "Summary",
      topic_clusters: [],
      format_patterns: [],
      positioning_profiles: [],
      comparisons: [],
      positioning_gaps: [],
      recommended_ideas: [idea],
    },
    model: "test",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    sources: SOURCE_IDS.map((id, index) => ({
      id,
      capture_version_id: CAPTURE_IDS[index],
      content_hash: `hash-${index}-0000000000000000`,
      competitor_id: COMPETITOR_ID,
      competitor_name: "Market Co",
      title: `Post ${index + 1}`,
      url: `https://competitor.test/${index + 1}`,
      platform: "linkedin",
      content_type: "social_post",
      published_at: "2026-06-01T00:00:00.000Z",
      captured_at: "2026-06-02T00:00:00.000Z",
      effective_at: "2026-06-01T00:00:00.000Z",
      date_basis: "published" as const,
    })),
    company_sources: [{
      id: COMPANY_ID,
      kind: "content_piece" as const,
      title: "Existing article",
      excerpt: "Previous company content.",
      content_hash: "company-hash-000000000000",
    }],
  } satisfies CompetitorIntelligenceRun;

  const result = competitorIdeaToBrief(idea, run);

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result).toMatchObject({
    brief: {
      type: "linkedin",
      title: "A practical decision checklist",
      objective: "Help readers make a sound decision.",
      keyPoints: ["Define the decision", "Compare the trade-offs"],
      marketIntelligence: {
        runId: RUN_ID,
        confidence: "medium",
        novelty: "adjacent",
        competitorSources: [
          expect.objectContaining({
            itemId: SOURCE_IDS[0],
            captureVersionId: CAPTURE_IDS[0],
            evidenceQuote: "Exact verified competitor excerpt number 1.",
          }),
          expect.objectContaining({
            itemId: SOURCE_IDS[1],
            captureVersionId: CAPTURE_IDS[1],
          }),
        ],
        companyReferences: [
          expect.objectContaining({ id: COMPANY_ID, kind: "content_piece" }),
        ],
      },
    },
  });
  expect(result.brief.additionalGuidance).toContain("Verify every factual claim using the company Vault.");

  expect(competitorIdeaToBrief(idea, {
    ...run,
    sources: run.sources.slice(0, 1),
  })).toEqual({
    ok: false,
    error: "This idea's immutable competitor evidence is incomplete. Refresh the intelligence report.",
  });
});
