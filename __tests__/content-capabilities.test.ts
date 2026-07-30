import {
  CONTENT_CAPABILITIES,
  hasContentCapability,
} from "@/lib/auth/content-capabilities";

describe("Content Studio capability matrix", () => {
  const expected = {
    super_admin: new Set(CONTENT_CAPABILITIES),
    client_admin: new Set([
      "manage_competitors",
      "collect_competitor_content",
      "edit_company_dna",
      "edit_style_profiles",
      "view_intelligence",
      "create_drafts",
      "edit_drafts",
      "approve_content",
    ]),
    va: new Set([
      "view_intelligence",
      "create_drafts",
      "edit_drafts",
    ]),
  };

  for (const [role, allowed] of Object.entries(expected)) {
    test(`${role} has exactly the declared capabilities`, () => {
      expect(
        Object.fromEntries(
          CONTENT_CAPABILITIES.map((capability) => [
            capability,
            hasContentCapability(role, capability),
          ]),
        ),
      ).toEqual(
        Object.fromEntries(
          CONTENT_CAPABILITIES.map((capability) => [
            capability,
            allowed.has(capability),
          ]),
        ),
      );
    });
  }

  test("unknown roles receive no content capability", () => {
    for (const capability of CONTENT_CAPABILITIES) {
      expect(hasContentCapability("authenticated", capability)).toBe(false);
    }
  });
});
