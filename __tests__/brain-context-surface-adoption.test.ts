import fs from "node:fs";
import path from "node:path";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Brain Context Phase 1 surface adoption", () => {
  it.each([
    ["Ask", "supabase/functions/vault-ask/index.ts"],
    ["Content", "supabase/functions/content-generate/index.ts"],
  ])("%s uses the shared Edge resolver and persists its snapshot", (_name, file) => {
    const code = source(file);
    expect(code).toContain('from "../_shared/brain-context.ts"');
    expect(code).toContain("resolveBrainContext({");
    expect(code).toContain("persistBrainContextSnapshot({");
    expect(code).toContain("brainContextSurfaceEnabled(");
  });

  it("Ideas uses the validated Node wrapper and returns provenance with each idea", () => {
    const code = source("app/api/content/topics/generate/route.ts");
    expect(code).toContain("resolveNodeBrainContext({");
    expect(code).toContain("persistNodeBrainContextSnapshot({");
    expect(code).toContain("brain_context_snapshot_id: brainContextSnapshotId");
  });

  it("Tools persists and links the exact resolved context", () => {
    const code = source("lib/tools/ai.ts");
    expect(code).toContain("resolveNodeBrainContext({");
    expect(code).toContain("persistNodeBrainContextSnapshot({");
    expect(code).toContain("brain_context_snapshot_id: brainContextSnapshotId");
  });
});
