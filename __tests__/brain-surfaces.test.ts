/** @jest-environment node */

import {
  memoryAppliesToSurfaces,
  normalizeBrainScopes,
  normalizeBrainSurface,
  signalSurfacesFor,
} from "@/supabase/functions/_shared/brain-surfaces";

describe("Brain surface vocabulary", () => {
  test("legacy Ask scope normalizes to vault_answer", () => {
    expect(normalizeBrainSurface("ask")).toBe("vault_answer");
    expect(normalizeBrainScopes(["ask", "vault_answer"])).toEqual(["vault_answer"]);
  });

  test("Ask lessons do not leak into content and content lessons do not leak into Ask", () => {
    expect(memoryAppliesToSurfaces({ surfaces: ["ask"] }, ["vault_answer"])).toBe(true);
    expect(memoryAppliesToSurfaces({ surfaces: ["ask"] }, ["content"])).toBe(false);
    expect(memoryAppliesToSurfaces({ surfaces: ["content"] }, ["vault_answer"])).toBe(false);
    expect(memoryAppliesToSurfaces({ surfaces: ["content"] }, ["content", "email"])).toBe(true);
  });

  test("global lessons apply everywhere but unknown non-empty scopes fail closed", () => {
    expect(memoryAppliesToSurfaces({}, ["content"])).toBe(true);
    expect(memoryAppliesToSurfaces({ surfaces: ["all"] }, ["vault_answer"])).toBe(true);
    expect(memoryAppliesToSurfaces({ surfaces: ["not-a-real-surface"] }, ["content"])).toBe(false);
    expect(memoryAppliesToSurfaces({ surfaces: "content" } as never, ["content"])).toBe(false);
  });

  test("content context loads only content-family feedback signals", () => {
    expect(signalSurfacesFor(["content"])).toEqual([
      "content",
      "content_topic",
      "content_draft",
      "content_outcome",
    ]);
    expect(signalSurfacesFor(["vault_answer"])).toEqual(["vault_answer", "ask", "vault"]);
  });
});
