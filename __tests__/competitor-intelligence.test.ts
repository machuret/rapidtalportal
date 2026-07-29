/** @jest-environment node */

import {
  competitorIdeaToBrief,
  competitorIntelligenceSchema,
  parseCompetitorIntelligence,
} from "@/lib/competitors/intelligence";

const COMPETITOR_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];

test("requires multi-source evidence for patterns, gaps and recommendations", () => {
  const parsed = competitorIntelligenceSchema.safeParse({
    schema_version: 1,
    executive_summary: "Summary",
    topic_clusters: [{
      id: "cluster",
      label: "Cluster",
      description: "Description",
      signal_strength: "emerging",
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: [SOURCE_IDS[0]],
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
      issue.path.join(".") === "topic_clusters.0.source_item_ids")).toBe(true);
  }
});

test("rejects reports from unsupported schema versions", () => {
  expect(parseCompetitorIntelligence({ schema_version: 2 })).toBeNull();
});

test("turns a recommendation into a bounded brief without treating market material as fact", () => {
  const result = competitorIdeaToBrief({
    title: "A practical decision checklist",
    channel: "linkedin",
    format: "Checklist",
    objective: "Help readers make a sound decision.",
    why_valuable: "The market discusses the issue but offers few practical steps.",
    differentiation: "Show a transparent process.",
    suggested_hook: "Most teams do not need another prediction.",
    key_points: ["Define the decision", "Compare the trade-offs"],
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS,
    confidence: "medium",
  });

  expect(result).toMatchObject({
    type: "linkedin",
    title: "A practical decision checklist",
  });
  expect(result.brief).toContain("Market opportunity:");
  expect(result.brief).toContain("Verify every factual claim using the company Vault.");
});
