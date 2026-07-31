import { readFileSync } from "node:fs";
import { join } from "node:path";
import { competitorIntelligenceSchema } from "@/lib/competitors/intelligence";
import { buildCompetitorMarketModel } from "@/lib/competitors/market-map";
import { competitorSimilarityWarnings } from "@/supabase/functions/_shared/content-quality";

const COMPETITOR_A = "11111111-1111-4111-8111-111111111111";
const COMPETITOR_B = "22222222-2222-4222-8222-222222222222";
const SOURCE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SOURCE_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const SOURCE_C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const COMPANY_SOURCE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const quote = (source_item_id: string, value: string) => ({
  source_item_id,
  quote: value,
});

describe("Phase 5 competitor strategic market model", () => {
  test("derives ownership, shared narratives, vocabulary and separate confidence", () => {
    const analysis = competitorIntelligenceSchema.parse({
      schema_version: 2,
      executive_summary: "A verified market summary.",
      topic_clusters: [{
        id: "practical-private-credit",
        label: "Practical private credit",
        description: "Competitors explain practical private credit choices.",
        signal_strength: "established",
        competitor_ids: [COMPETITOR_A, COMPETITOR_B],
        source_item_ids: [SOURCE_A, SOURCE_B, SOURCE_C],
        evidence_quotes: [
          quote(SOURCE_A, "Practical private credit education helps investors compare different choices."),
          quote(SOURCE_B, "Private credit choices require practical education for first-time investors."),
          quote(SOURCE_C, "Practical comparison content makes private credit easier to understand."),
        ],
        channels: ["linkedin"],
      }],
      format_patterns: [{
        name: "Practical checklist",
        description: "A checklist format appears repeatedly.",
        hook_pattern: "Start with a direct investor question.",
        structure_pattern: "Question, checklist, explanation.",
        cta_pattern: "Ask the reader which option they would compare first.",
        competitor_ids: [COMPETITOR_A, COMPETITOR_B],
        source_item_ids: [SOURCE_A, SOURCE_B, SOURCE_C],
        evidence_quotes: [
          quote(SOURCE_A, "Practical private credit education helps investors compare different choices."),
          quote(SOURCE_B, "Private credit choices require practical education for first-time investors."),
          quote(SOURCE_C, "Practical comparison content makes private credit easier to understand."),
        ],
        channels: ["linkedin"],
      }],
      positioning_profiles: [{
        competitor_id: COMPETITOR_A,
        summary: "Focuses on practical investor education.",
        audience: ["First-time property investors"],
        themes: ["private credit", "practical comparison"],
        value_propositions: ["Clear choices"],
        tone: ["educational"],
        source_item_ids: [SOURCE_A],
        evidence_quotes: [
          quote(SOURCE_A, "Practical private credit education helps investors compare different choices."),
        ],
      }],
      comparisons: [],
      positioning_gaps: [{
        title: "Explain the first decision",
        description: "Few examples explain the first comparison a new investor should make.",
        gap_type: "audience",
        rationale: "The evidence targets experienced investors more often than beginners.",
        company_fit: "high",
        competitor_ids: [COMPETITOR_A, COMPETITOR_B],
        source_item_ids: [SOURCE_A, SOURCE_B, SOURCE_C],
        evidence_quotes: [
          quote(SOURCE_A, "Practical private credit education helps investors compare different choices."),
          quote(SOURCE_B, "Private credit choices require practical education for first-time investors."),
          quote(SOURCE_C, "Practical comparison content makes private credit easier to understand."),
        ],
        recommended_channels: ["linkedin"],
        suggested_angles: ["A first-time investor checklist"],
      }],
      recommended_ideas: [{
        title: "The first private-credit comparison to make",
        channel: "linkedin",
        format: "Checklist",
        objective: "Help first-time investors compare options.",
        why_valuable: "The market covers private credit but rarely starts with the first decision.",
        differentiation: "Lead with a beginner decision framework.",
        suggested_hook: "Before comparing rates, compare the structure.",
        key_points: ["Define the decision", "Explain the trade-off"],
        competitor_ids: [COMPETITOR_A, COMPETITOR_B],
        source_item_ids: [SOURCE_A, SOURCE_B, SOURCE_C],
        evidence_quotes: [
          quote(SOURCE_A, "Practical private credit education helps investors compare different choices."),
          quote(SOURCE_B, "Private credit choices require practical education for first-time investors."),
          quote(SOURCE_C, "Practical comparison content makes private credit easier to understand."),
        ],
        company_reference_ids: [COMPANY_SOURCE],
        novelty: "new",
        overlap_warning: "",
        confidence: "high",
      }],
    });
    const evidence = [
      {
        id: SOURCE_A,
        competitor_id: COMPETITOR_A,
        raw_content: "Practical private credit education helps investors compare different choices.",
        effective_at: "2026-07-28T00:00:00.000Z",
        date_basis: "published" as const,
      },
      {
        id: SOURCE_B,
        competitor_id: COMPETITOR_B,
        raw_content: "Private credit choices require practical education for first-time investors.",
        effective_at: "2026-07-20T00:00:00.000Z",
        date_basis: "published" as const,
      },
      {
        id: SOURCE_C,
        competitor_id: COMPETITOR_A,
        raw_content: "Practical comparison content makes private credit easier to understand.",
        effective_at: "2026-06-20T00:00:00.000Z",
        date_basis: "published" as const,
      },
    ];

    const result = buildCompetitorMarketModel({
      analysis,
      evidence,
      windowEnd: "2026-07-31T00:00:00.000Z",
    });

    expect(result.market_map?.topic_ownership).toEqual(expect.arrayContaining([
      expect.objectContaining({ competitor_id: COMPETITOR_A, source_share: 67 }),
      expect.objectContaining({ competitor_id: COMPETITOR_B, source_share: 33 }),
    ]));
    expect(result.market_map?.shared_narratives).toHaveLength(1);
    expect(result.market_map?.recurring_vocabulary.map((entry) => entry.term))
      .toEqual(expect.arrayContaining(["practical", "private", "credit"]));
    expect(result.recommended_ideas[0]).toMatchObject({
      market_confidence: "medium",
      company_evidence_strength: "weak",
      opportunity_horizon: "current",
    });
    expect(result.market_map?.strategic_recommendations[0]).toMatchObject({
      market_confidence: "medium",
      company_evidence_strength: "weak",
    });
  });

  test("warns on copied competitor phrases and leaves an original angle alone", () => {
    const competitor =
      "Private credit can open a practical path for property investors who need flexible capital.";
    expect(competitorSimilarityWarnings(
      "Private credit can open a practical path for property investors who need flexible capital. Let us talk.",
      [competitor],
    )).toEqual(expect.arrayContaining([
      expect.stringContaining("Competitor phrase similarity"),
    ]));
    expect(competitorSimilarityWarnings(
      "A financing decision starts with the constraints of the property, the borrower and the intended exit.",
      [competitor],
    )).toEqual([]);
  });

  test("stores a prompt version, model version and deterministic analysis hash", () => {
    const migration = readFileSync(
      join(process.cwd(), "db/migrations/127_competitor_strategic_market_model.sql"),
      "utf8",
    );
    expect(migration).toContain("prompt_version TEXT NOT NULL");
    expect(migration).toContain("market_model_version INTEGER NOT NULL");
    expect(migration).toContain("set_competitor_intelligence_analysis_hash");
    expect(migration).toContain("extensions.digest(convert_to(NEW.analysis::TEXT, 'UTF8'), 'sha256')");
  });
});
