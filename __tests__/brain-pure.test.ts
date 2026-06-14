import { similarityRatio } from "@/lib/brain/textdiff";
import { profileGaps, PROFILE_FIELD_DEFS } from "@/lib/brain/gaps";
import { levelFor } from "@/lib/brain/score";

describe("similarityRatio (edit-distance bucketing for approvals)", () => {
  it("is 1 for identical text", () => {
    expect(similarityRatio("the quick brown fox", "the quick brown fox")).toBe(1);
  });

  it("is 1 for two empty strings and 0 when only one side is empty", () => {
    expect(similarityRatio("", "")).toBe(1);
    expect(similarityRatio("hello world", "")).toBe(0);
    expect(similarityRatio("", "hello world")).toBe(0);
  });

  it("is 0 for fully disjoint wording", () => {
    expect(similarityRatio("alpha beta gamma", "delta epsilon zeta")).toBe(0);
  });

  it("is symmetric and ignores case/punctuation", () => {
    const a = "Our refund policy lasts 30 days.";
    const b = "our REFUND policy lasts 30 days!!!";
    expect(similarityRatio(a, b)).toBe(similarityRatio(b, a));
    expect(similarityRatio(a, b)).toBe(1);
  });

  it("lands between 0 and 1 for partial overlap, above the kept-verbatim threshold when mostly unchanged", () => {
    // A realistic-length draft with a single word changed stays well above the
    // 0.85 "kept ~verbatim" threshold the approval signal uses.
    const original = "Our team offers guided half day whale watching tours departing daily from the central waterfront with experienced marine biologists and complimentary refreshments";
    const lightlyEdited = original.replace("waterfront", "harbour");
    const r = similarityRatio(original, lightlyEdited);
    expect(r).toBeGreaterThan(0.85);
    expect(r).toBeLessThan(1);

    const heavyRewrite = "Book a sunset cruise and see dolphins up close every evening";
    expect(similarityRatio(original, heavyRewrite)).toBeLessThan(0.85); // counts as a rewrite
  });
});

describe("profileGaps (onboarding gap analysis)", () => {
  const filledAll = Object.fromEntries(PROFILE_FIELD_DEFS.map((f) => [f.key, "something"]));

  it("treats a null profile as 0% with every field a gap", () => {
    const g = profileGaps(null);
    expect(g.completionPct).toBe(0);
    expect(g.filledCount).toBe(0);
    expect(g.gaps).toHaveLength(PROFILE_FIELD_DEFS.length);
  });

  it("reports 100% and no gaps when every field is filled", () => {
    const g = profileGaps(filledAll);
    expect(g.completionPct).toBe(100);
    expect(g.gaps).toHaveLength(0);
    expect(g.draftableGaps).toHaveLength(0);
  });

  it("ignores whitespace-only values (they aren't 'filled')", () => {
    const g = profileGaps({ ...filledAll, services: "   " });
    expect(g.gaps.map((x) => x.key)).toContain("services");
  });

  it("sorts gaps by impact (highest first) and only offers draftable gaps to the AI", () => {
    const g = profileGaps(null);
    for (let i = 1; i < g.gaps.length; i++) {
      expect(g.gaps[i - 1].impact).toBeGreaterThanOrEqual(g.gaps[i].impact);
    }
    // internal_rules is intentionally not AI-draftable.
    expect(g.gaps.some((x) => x.key === "internal_rules")).toBe(true);
    expect(g.draftableGaps.some((x) => x.key === "internal_rules")).toBe(false);
  });

  it("computes a sensible partial percentage", () => {
    const g = profileGaps({ company_name: "Acme", services: "Widgets" });
    expect(g.filledCount).toBe(2);
    expect(g.completionPct).toBe(Math.round((2 / PROFILE_FIELD_DEFS.length) * 100));
  });
});

describe("levelFor (Brain Score → level bands)", () => {
  it("maps each band at its boundaries", () => {
    expect(levelFor(0)).toBe("Newborn");
    expect(levelFor(19)).toBe("Newborn");
    expect(levelFor(20)).toBe("Learning");
    expect(levelFor(39)).toBe("Learning");
    expect(levelFor(40)).toBe("Sharp");
    expect(levelFor(64)).toBe("Sharp");
    expect(levelFor(65)).toBe("Expert");
    expect(levelFor(84)).toBe("Expert");
    expect(levelFor(85)).toBe("Genius");
    expect(levelFor(100)).toBe("Genius");
  });

  it("is monotonic — a higher score never yields a lower band", () => {
    const order = ["Newborn", "Learning", "Sharp", "Expert", "Genius"];
    let prev = -1;
    for (let s = 0; s <= 100; s++) {
      const idx = order.indexOf(levelFor(s));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });
});
