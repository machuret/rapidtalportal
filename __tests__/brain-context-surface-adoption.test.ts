import fs, { existsSync } from "node:fs";
import path from "node:path";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("official Brain Context surface adoption", () => {
  it.each([
    ["Ask", "supabase/functions/vault-ask/index.ts"],
    ["Content", "supabase/functions/content-generate/index.ts"],
  ])("%s uses the shared Edge resolver and persists its snapshot", (_name, file) => {
    const code = source(file);
    expect(code).toContain('from "../_shared/brain-context.ts"');
    expect(code).toContain("resolveBrainContext({");
    expect(code).toContain("persistBrainContextSnapshot({");
    expect(code).not.toContain("brainContextSurfaceEnabled(");
    expect(code).not.toContain("retrieveContentVault");
  });

  it("always gives the content Brain snapshot an explicit selected-source list", () => {
    const code = source("supabase/functions/content-generate/index.ts");
    expect(code).toContain("projectId ? (selectedVaultSourceIds ?? []) : []");
  });

  it("Ideas uses the validated Node wrapper and returns provenance with each idea", () => {
    const code = source("app/api/content/topics/generate/route.ts");
    expect(code).toContain("resolveNodeBrainContext({");
    expect(code).toContain("persistNodeBrainContextSnapshot({");
    expect(code).toContain("brain_context_snapshot_id: brainContextSnapshotId");
    expect(code).toContain("BRAIN_SNAPSHOT_REQUIRED");
  });

  it("Tools persists and links the exact resolved context", () => {
    const code = source("lib/tools/ai.ts");
    expect(code).toContain("resolveNodeBrainContext({");
    expect(code).toContain("persistNodeBrainContextSnapshot({");
    expect(code).toContain("brain_context_snapshot_id: brainContextSnapshotId");
    expect(code).not.toContain("nodeBrainContextEnabled");
    expect(code).not.toContain("toolGrounding");
  });

  it("Onboarding uses the official company-only resolver boundary and required snapshot", () => {
    const code = source("app/api/brain/onboard/route.ts");
    expect(code).toContain("resolveNodeBrainContext({");
    expect(code).toContain('surface: "onboard"');
    expect(code).toContain("persistNodeBrainContextSnapshot({");
    expect(code).toContain('artifactKind: "brain_onboarding_draft"');
    expect(code).toContain("brainContextSnapshotId");
    expect(code).toContain("maxLibrary: 0");
    expect(code).toContain("maxMemory: 0");
    expect(code).toContain("BRAIN_CONTEXT_UNAVAILABLE");
    expect(code).toContain("BRAIN_SNAPSHOT_REQUIRED");
    expect(code).not.toContain('.from("vault_items")');
    expect(code).not.toContain("ai_summary");
    expect(code).not.toContain("raw_content");
  });

  it("has no legacy local Brain context builder", () => {
    expect(existsSync(path.join(process.cwd(), "lib/brain/context.ts"))).toBe(false);
    const officialSurfaces = [
      "app/api/brain/onboard/route.ts",
      "app/api/content/topics/generate/route.ts",
      "lib/tools/ai.ts",
      "lib/brain/opportunities.ts",
    ].map(source).join("\n");
    expect(officialSurfaces).not.toContain("buildBrainContext");
  });
});
