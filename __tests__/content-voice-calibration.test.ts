/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  calibrateStyleProfile,
  deterministicVoiceMetrics,
  type ContentGoldenExample,
} from "@/lib/content/voice-calibration";
import type { StyleAnalysisRecord, StyleAnalysisSource } from "@/lib/content/style-analysis";

const migration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "107_content_voice_calibration.sql"),
  "utf8",
);

function golden(index: number, overrides: Partial<ContentGoldenExample> = {}): ContentGoldenExample {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    client_id: "11111111-1111-4111-8111-111111111111",
    channel: "linkedin",
    title: `Published example ${index}`,
    body: `A direct opening for decision makers.\n\nThis practical explanation uses evidence and plain language ${index}.\n\nWhat constraint are you seeing?`,
    source_url: `https://example.com/posts/${index}`,
    published_at: `2026-0${Math.min(index, 9)}-01T00:00:00.000Z`,
    content_type: index % 2 ? "founder-led" : "educational",
    represents_brand_strongly: true,
    voice_traits: ["Direct", "Evidence-led"],
    structural_traits: ["Hook, explanation, one question"],
    vocabulary_preferences: ["practical", "decision makers"],
    admin_notes: null,
    evaluation_permission: true,
    status: "approved",
    content_hash: "a".repeat(64),
    approved_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const profile: StyleAnalysisRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  client_id: "11111111-1111-4111-8111-111111111111",
  channel: "linkedin",
  status: "approved",
  analysis: {
    schema_version: 1,
    summary: "Direct, practical and evidence-led.",
    voice_traits: ["Direct tension", "Evidence-led explanation"],
    tone: "Calm confidence",
    audience_relationship: "Informed peers",
    hook_patterns: ["Open with a concrete business tension"],
    structure_patterns: ["Hook, evidence, implication, one question"],
    sentence_style: "Short declarative sentences",
    paragraph_style: "One or two sentences",
    formatting_patterns: ["Deliberate whitespace"],
    vocabulary_patterns: ["Practical", "Decision makers"],
    cta_patterns: ["One reflective question"],
    emoji_usage: "None",
    hashtag_usage: "Restrained",
    content_patterns: ["Explain one issue through evidence"],
    avoid_patterns: ["Generic inspiration"],
    confidence: "high",
    evidence: [
      { source_item_id: "33333333-3333-4333-8333-333333333333", observations: ["Direct hook"] },
      { source_item_id: "44444444-4444-4444-8444-444444444444", observations: ["Short paragraphs"] },
    ],
  },
  source_item_ids: [],
  source_count: 8,
  source_character_count: 8000,
  model: "test",
  analysed_at: "2026-07-20T00:00:00.000Z",
  approved_at: "2026-07-20T00:00:00.000Z",
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
};

const sources: StyleAnalysisSource[] = Array.from({ length: 8 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  title: `Source ${index}`,
  source_url: null,
  status: "ready",
  channels: ["linkedin"],
  character_count: 1000,
  created_at: "2026-07-10T00:00:00.000Z",
}));

describe("Phase 3 voice calibration", () => {
  test("keeps evaluation material service-role only and isolated from the factual Vault", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS content_golden_examples");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS content_voice_evaluations");
    expect(migration).toMatch(/REVOKE ALL ON TABLE content_golden_examples FROM PUBLIC, anon, authenticated/u);
    expect(migration).toMatch(/GRANT ALL ON TABLE content_golden_examples TO service_role/u);
    expect(migration).not.toMatch(/INSERT INTO vault_items/u);
    expect(migration).toContain("Only client administrators can review voice evaluations.");
    expect(migration).toContain("status = 'ready'");
  });

  test("surfaces insufficient, contradictory and outdated style evidence deterministically", () => {
    const result = calibrateStyleProfile({
      profile: {
        ...profile,
        analysed_at: "2026-01-01T00:00:00.000Z",
        analysis: {
          ...profile.analysis,
          vocabulary_patterns: ["Practical"],
          avoid_patterns: ["practical"],
        },
      },
      sources: sources.map((source) => ({ ...source, created_at: "2026-07-25T00:00:00.000Z" })),
      goldens: [golden(1), golden(2)],
    });
    expect(result.confidence).toBe("low");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "insufficient_examples",
      "contradictory",
      "outdated",
    ]));
  });

  test("detects generic language, copied phrases and quality-gate failures without model judgment", () => {
    const goldens = Array.from({ length: 6 }, (_, index) => golden(index + 1));
    const body = `In today's fast-paced world, take it to the next level.\n\n${goldens[0].body}`;
    const metrics = deterministicVoiceMetrics({
      body,
      goldens,
      competitorBodies: ["A competitor phrase that should not be reproduced exactly in generated work."],
      warnings: ["Unsupported claim lacks source evidence.", "LinkedIn structure length requirement failed."],
    });
    expect(metrics.genericnessRisk).toBeGreaterThan(0);
    expect(metrics.copyingRisk).toBeGreaterThan(0);
    expect(metrics.longestCopiedPhraseWords).toBeGreaterThanOrEqual(6);
    expect(metrics.hardRulesPass).toBe(false);
    expect(metrics.unsupportedClaimsPass).toBe(false);
    expect(metrics.channelStructurePass).toBe(false);
  });

  test("marks a well-sampled, distinctive profile as high confidence", () => {
    const result = calibrateStyleProfile({
      profile,
      sources,
      goldens: Array.from({ length: 6 }, (_, index) => golden(index + 1)),
      competitorVocabulary: ["Completely unrelated terminology and market language"],
    });
    expect(result.confidence).toBe("high");
    expect(result.approvedGoldenCount).toBe(6);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "blocking")).toBe(false);
  });
});
