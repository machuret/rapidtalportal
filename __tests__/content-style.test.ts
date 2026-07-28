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
      "Review prohibited phrase: “guaranteed results”",
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
      companyDnaUpdatedAt: "2026-07-28T00:00:00.000Z",
      capturedAt: "2026-07-28T01:00:00.000Z",
    });
  });
});
