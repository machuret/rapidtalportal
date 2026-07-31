import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/129_business_library_brain_retrieval.sql"),
  "utf8",
);
const resolver = readFileSync(
  join(process.cwd(), "supabase/functions/_shared/brain-context.ts"),
  "utf8",
);
const ask = readFileSync(
  join(process.cwd(), "supabase/functions/vault-ask/index.ts"),
  "utf8",
);

describe("Business Library Brain retrieval", () => {
  test("returns only the current, published and fresh release", () => {
    expect(migration).toContain("e.current_version_id = v.id");
    expect(migration).toContain("v.status = 'published'");
    expect(migration).toContain("v.valid_until IS NULL OR v.valid_until >= current_date");
    expect(migration).toContain("v.review_due_at IS NULL OR v.review_due_at > clock_timestamp()");
  });

  test("is service-role only and bounded", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("least(coalesce(p_match_count, 8), 30)");
  });

  test("records exact Library provenance and recovers without inventing context", () => {
    expect(resolver).toContain('admin.rpc("match_business_library_chunks"');
    expect(resolver).toContain("libraryEntryIds");
    expect(resolver).toContain("libraryVersionIds");
    expect(resolver).toContain("libraryChunkIds");
    expect(resolver).toContain("business_library_search_degraded");
    expect(resolver).toContain("business_library_unavailable");
  });

  test("Ask always resolves and snapshots the official Brain before generation", () => {
    expect(ask).toContain("resolveBrainContext({");
    expect(ask).toContain("persistBrainContextSnapshot({");
    expect(ask).toContain('artifactKind: "vault_answer"');
    expect(ask).not.toContain("brainContextSurfaceEnabled");
    expect(ask).not.toContain("match_vault_chunks");
    expect(ask).toContain('kind: "library"');
    expect(ask).toContain("General guidance, not a company fact.");
  });
});
