import { BRAIN_PROFILE_FIELDS, selectFields, fieldKeys } from "@/lib/brain/profile-fields";
import { PROFILE_FIELD_DEFS } from "@/lib/brain/gaps";

describe("Brain profile-field registry", () => {
  it("is the single source the three concerns derive from", () => {
    // Onboarding (gaps) ⊆ completeness ⊆ prompt — each concern is deliberate.
    const onboarding = fieldKeys("onboarding");
    const completeness = fieldKeys("completeness");
    const prompt = fieldKeys("prompt");
    expect(prompt.length).toBe(BRAIN_PROFILE_FIELDS.length); // all fields feed the prompt
    expect(new Set(completeness).size).toBe(completeness.length);
    // Every onboarding field must also count toward completeness and the prompt.
    for (const k of onboarding) {
      expect(completeness).toContain(k);
      expect(prompt).toContain(k);
    }
    // Every completeness field must also feed the prompt.
    for (const k of completeness) expect(prompt).toContain(k);
  });

  it("keeps the gaps export in sync with the onboarding concern", () => {
    expect(PROFILE_FIELD_DEFS.map((f) => f.key)).toEqual(fieldKeys("onboarding"));
    // Onboarding fields must carry a real question.
    for (const f of PROFILE_FIELD_DEFS) expect(f.question.trim().length).toBeGreaterThan(0);
  });

  it("only auto/derived fields are excluded from onboarding", () => {
    // website_content (scraped) and client_type (set at creation) are the only
    // non-onboarding fields — they have no user-facing question.
    const nonOnboarding = selectFields("prompt").filter((f) => !f.onboarding).map((f) => f.key);
    expect(nonOnboarding.sort()).toEqual(["client_type", "website_content"]);
  });
});
