import {
  analyseEditorialChange,
  dimensionsForFeedbackReason,
} from "@/lib/brain/editorial-learning";
import { sharedSignalDimensions } from "@/lib/brain/distill";

describe("editorial learning analysis", () => {
  it("creates no learning suggestion for a one-word edit", () => {
    const result = analyseEditorialChange({
      before: "We help founders build stronger businesses.",
      after: "We help founders build resilient businesses.",
      channel: "linkedin",
    });
    expect(result.meaningful).toBe(false);
    expect(result.outcome).toBe("no_reusable_learning");
  });

  it("recognises repeated hook changes as a proposed channel-style update", () => {
    const result = analyseEditorialChange({
      before: "Unlock the deal of a lifetime today!\n\nOur team can transform your business. Contact us today.",
      after: "What changes when founders stop chasing every opportunity?\n\nA focused operating rhythm gives the team room to make better decisions.\n\nWhat would you simplify first?",
      channel: "linkedin",
      contentType: "founder_opinion",
      priorSimilarEdits: 2,
    });
    expect(result.meaningful).toBe(true);
    expect(result.dimensions).toEqual(expect.arrayContaining(["hook", "voice", "cta"]));
    expect(result.outcome).toBe("channel_style_update");
    expect(result.suggestedLesson).toMatch(/promotional language|discussion-question|openings/i);
  });

  it("routes factual corrections to Company DNA rather than writing memory", () => {
    const result = analyseEditorialChange({
      before: "RapidTal is based in Sydney and has 24 employees.",
      after: "RapidTal is based in Melbourne and has 26 employees.",
      channel: "linkedin",
    });
    expect(result.meaningful).toBe(true);
    expect(result.classification).toBe("company_factual");
    expect(result.outcome).toBe("company_dna_update");
    expect(result.dimensions).toContain("claims");
    expect(result.suggestedLesson).toMatch(/Company DNA|Vault/);
  });

  it("maps structured feedback reasons to supported dimensions", () => {
    expect(dimensionsForFeedbackReason("Too promotional")).toEqual([
      "promotional_intensity",
      "voice",
    ]);
    expect(dimensionsForFeedbackReason("Wrong CTA")).toEqual(["cta"]);
    expect(dimensionsForFeedbackReason("Other")).toEqual([]);
  });

  it("allows distillation only inside dimensions shared by every supporting signal", () => {
    expect(sharedSignalDimensions([
      { dimensions: ["voice", "promotional_intensity"] },
      { dimensions: ["voice", "cta"] },
    ])).toEqual(["voice"]);
    expect(sharedSignalDimensions([
      { dimensions: ["voice"] },
      { dimensions: ["cta"] },
    ])).toEqual([]);
  });
});
