/** @jest-environment node */

import {
  contentStyleWarnings,
  createContentStyleSnapshot,
  resolveContentStyle,
} from "@/supabase/functions/_shared/content-style";

describe("content brand style", () => {
  const dna = {
    internal_rules: "Never promise guaranteed results.",
    prohibited_claims: "guaranteed results, without qualification",
    prohibited_terms: "cheap, world-class",
    brand_voice: "Practical, calm and candid.",
    content_style: "Use short paragraphs and concrete examples.",
    emoji_policy: "No emojis",
    spelling_locale: "Australian English",
    default_cta_style: "Invite one clear next step.",
    channel_styles: {
      linkedin: "Authoritative, no emojis, finish with a discussion question.",
      facebook: "Warm, local and conversational.",
    },
  };

  test("resolves company guidance before voice, channel style and user tone", () => {
    const style = resolveContentStyle(dna, "linkedin", "Playful", "Keep it short.");
    expect(style.prompt.indexOf("Priority company guidance")).toBeLessThan(style.prompt.indexOf("Brand voice"));
    expect(style.prompt.indexOf("Brand voice")).toBeLessThan(style.prompt.indexOf("linkedin style"));
    expect(style.prompt.indexOf("linkedin style")).toBeLessThan(style.prompt.indexOf("Requested tone"));
    expect(style.prompt).toContain("Authoritative, no emojis");
    expect(style.summary).toContain("Spelling and locale: Australian English");
    expect(style.summary).toContain("Emoji policy: No emojis");
    expect(style.summary).toContain("Requested tone: Playful");
  });

  test("applies only the selected channel override", () => {
    const style = resolveContentStyle(dna, "facebook", "Friendly", "Standard length.");
    expect(style.prompt).toContain("Warm, local and conversational");
    expect(style.prompt).not.toContain("finish with a discussion question");
  });

  test("flags exact prohibited words and claims after generation", () => {
    const style = resolveContentStyle(dna, "linkedin", "Professional", "Short.");
    expect(contentStyleWarnings("Our cheap service guarantees guaranteed results, without qualification.", style)).toEqual([
      "Review prohibited phrase: “cheap”",
      "Review prohibited phrase: “guaranteed results, without qualification”",
    ]);
  });

  test("uses word boundaries and enforces explicit no-emoji policies", () => {
    const style = resolveContentStyle(dna, "linkedin", "Professional", "Short.");
    expect(contentStyleWarnings("A cheaper option with practical advice.", style)).toEqual([]);
    expect(contentStyleWarnings("A practical update 🚀", style)).toEqual([
      "Remove emoji: Company DNA disallows them for this content.",
    ]);
  });

  test("creates an auditable style snapshot", () => {
    const style = resolveContentStyle(dna, "facebook", "Friendly", "Standard.");
    expect(createContentStyleSnapshot(
      style,
      "facebook",
      "2026-07-28T00:00:00.000Z",
      "2026-07-28T01:00:00.000Z",
    )).toEqual({
      channel: "facebook",
      summary: style.summary,
      hardRules: [],
      styleAnalysis: null,
      companyDnaUpdatedAt: "2026-07-28T00:00:00.000Z",
      capturedAt: "2026-07-28T01:00:00.000Z",
    });
  });

  test("uses only the approved analysis for the selected channel and keeps manual style authoritative", () => {
    const style = resolveContentStyle({
      ...dna,
      style_analysis_profiles: {
        linkedin: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          analysis: {
            summary: "Direct, evidence-led and conversational.",
            voice_traits: ["Candid", "Practical"],
            hook_patterns: ["Open with a concrete tension"],
            cta_patterns: ["Finish with one reflective question"],
          },
          source_item_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
          analysed_at: "2026-07-29T01:00:00.000Z",
          approved_at: "2026-07-29T02:00:00.000Z",
        },
      },
    }, "linkedin", "Playful", "Short.");

    expect(style.prompt).toContain("Approved linkedin style analysis");
    expect(style.prompt).toContain("Open with a concrete tension");
    expect(style.prompt.indexOf("linkedin style")).toBeLessThan(
      style.prompt.indexOf("Approved linkedin style analysis"),
    );
    expect(style.summary).toContain(
      "Approved linkedin style analysis: Direct, evidence-led and conversational.",
    );
    expect(style.styleAnalysis).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      channel: "linkedin",
      summary: "Direct, evidence-led and conversational.",
      sourceItemIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      analysedAt: "2026-07-29T01:00:00.000Z",
      approvedAt: "2026-07-29T02:00:00.000Z",
    });
  });
});
