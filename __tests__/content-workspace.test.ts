/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("unified content engine", () => {
  const generator = read("supabase/functions/content-generate/index.ts");
  const orchestration = read("supabase/functions/_shared/content-generation-orchestration.ts");
  const retrieval = read("supabase/functions/_shared/content-vault-retrieval.ts");
  const quality = read("supabase/functions/_shared/content-quality.ts");
  const compose = read("components/vault/ComposeClient.tsx");
  const generateRoute = read("app/api/content/generate/route.ts");

  test("Content and Compose use one engine and one Vault retrieval implementation", () => {
    expect(compose).toContain('"/content/generate"');
    expect(compose).not.toContain("/vault/ask");
    expect(generator).toContain('import { retrieveContentVault }');
    expect(generator).toContain("await retrieveContentVault");
    expect(generator).not.toContain('.from("vault_items")');
    expect(retrieval).toContain('.from("vault_items")');
    expect(retrieval).toContain('admin.rpc("match_vault_chunks"');
  });

  test("the public generation boundary requires a structured brief and one platform", () => {
    expect(generateRoute).toContain("structuredBriefSchema");
    expect(generateRoute).toContain("objective:");
    expect(generateRoute).toContain("audience:");
    expect(generateRoute).toContain("keyPoints:");
    expect(generateRoute).toContain("callToAction:");
    expect(generateRoute).not.toContain('"instagram",\n    "social",');
    expect(quality).toContain("Do not write Facebook or Instagram variants.");
    expect(generator).not.toContain("Write three clearly labelled variants");
  });

  test("resolved brief, Vault sources and style provenance are persisted and returned", () => {
    expect(generator).toContain("content_brief: contentBrief");
    expect(generator).toContain("source_references: verifiedSources");
    expect(generator).toContain("style_snapshot: styleSnapshot");
    expect(generator).toContain("styleSnapshot,");
    expect(generator).toContain("sources: verifiedSources");
    expect(orchestration).toContain("sourceItemIds");
  });

  test("quality validation runs before persistence and preserves section-only rewriting", () => {
    expect(orchestration).toContain("contentQualityWarnings({");
    expect(generator).toContain("The generated draft did not pass the content quality gate. No draft was created.");
    expect(generator.indexOf("if (qualityWarnings.length)")).toBeLessThan(
      generator.indexOf("if (persist)"),
    );
    expect(orchestration).toContain("enforceStructure: !sectionOnlyRewrite");
  });
});

describe("editorial workspace integrity", () => {
  const migration = read("db/migrations/092_unified_content_workspace.sql");
  const atomicRewrite = read("db/migrations/093_atomic_content_rewrites.sql");
  const rewrite = read("app/api/content/rewrite/route.ts");
  const revisions = read("app/api/content/revisions/route.ts");
  const duplicate = read("app/api/content/duplicate/route.ts");
  const adapt = read("app/api/content/adapt/route.ts");
  const history = read("components/content/HistoryTab.tsx");

  test("revision snapshots are tenant-scoped and captured before every material edit", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS content_piece_revisions");
    expect(migration).toContain("ALTER TABLE content_piece_revisions ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("client_id = current_user_client_id()");
    expect(migration).toContain("BEFORE UPDATE ON content_pieces");
    expect(migration).toContain("INSERT INTO content_piece_revisions");
    expect(migration).toContain("NEW.revision_reason := NULL");
    expect(revisions).toContain("assertClientAccess");
    expect(revisions).toContain('.eq("client_id", parsed.data.client_id)');
  });

  test("rewrites are draft-only, non-duplicating engine calls with tenant-qualified saves", () => {
    expect(rewrite).toContain('piece.status !== "draft"');
    expect(rewrite).toContain("persist: false");
    expect(rewrite).toContain('scope === "section"');
    expect(rewrite).toContain('rpc("commit_content_piece_rewrite"');
    expect(rewrite).toContain("p_expected_updated_at");
    expect(rewrite).toContain("selectionStart");
    expect(atomicRewrite).toContain("generation_kind = 'rewrite'");
    expect(atomicRewrite).toContain("FOR UPDATE");
    expect(atomicRewrite).toContain("v_piece.updated_at IS DISTINCT FROM p_expected_updated_at");
    expect(atomicRewrite).toContain("FROM PUBLIC, anon, authenticated");
  });

  test("duplicate and adaptation retain lineage and always create a draft artifact", () => {
    expect(duplicate).toContain("parent_piece_id: parsed.data.id");
    expect(duplicate).toContain('generation_kind: "duplicate"');
    expect(duplicate).toContain('status: "draft"');
    expect(adapt).toContain("parentPieceId: parsed.data.id");
    expect(adapt).toContain('generationKind: "adaptation"');
    expect(adapt).not.toContain('.update({');
    expect(adapt).toContain('target_type: z.enum(["email", "x", "linkedin", "facebook", "instagram"');
  });

  test("workspace exposes editing, rewriting, comparison, workflow, duplication and export", () => {
    expect(history).toContain("Save draft");
    expect(history).toContain("Rewrite selection");
    expect(history).toContain("Revision history");
    expect(history).toContain("Current draft");
    expect(history).toContain("Duplicate");
    expect(history).toContain("Adapt");
    expect(history).toContain("Approve");
    expect(history).toContain("Archive");
    expect(history).toContain("Export .txt");
  });
});
