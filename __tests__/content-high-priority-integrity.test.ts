/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("Content Studio high-priority integrity repairs", () => {
  const page = read("app/(portal)/content/page.tsx");
  const topics = read("app/api/content/topics/generate/route.ts");
  const workflow = read("components/content/ContentProjectWorkflow.tsx");
  const studio = read("components/content/ContentStudio.tsx");
  const history = read("components/content/HistoryTab.tsx");
  const pieces = read("app/api/content/pieces/route.ts");
  const generator = read("supabase/functions/content-generate/index.ts");
  const migration = read("db/migrations/113_content_high_priority_integrity.sql");

  test("initial database failures are not presented as empty content", () => {
    expect(page).toContain("results.find((result) => result.error)");
    expect(page).toContain("Content Studio could not load your saved work");
  });

  test("topic output is bounded, repaired and exact before it reaches saving", () => {
    expect(topics).toContain("generatedTopicsSchema.safeParse");
    expect(topics).toContain("result.topics.length !== count");
    expect(topics).toContain("REPAIR REQUIRED");
    expect(topics).toContain("args.count * 650");
    expect(topics).toContain("args.count * 2_500");
    expect(topics).toContain("title: z.string().trim().min(1).max(300)");
    expect(topics).toContain("description: z.string().trim().min(1).max(2000)");
    expect(topics).toContain("INCOMPLETE_VERIFIED_IDEA_SET");
  });

  test("only deterministically relevant evidence is exposed and scored", () => {
    expect(topics).toContain("supportingVaultMaterial: relevantVaultIds.map");
    expect(topics).toContain("supportingMarketSignals = relevantMarketIds.map");
    expect(topics).toContain("existingCompanyContent: relevantExistingContentIds.map");
    expect(topics).toContain("competitor_sources: relevantMarketIds.map");
    expect(topics).toContain("semantic_embeddings");
    expect(topics).toContain("verifiedComparisonClaim");
    expect(topics).not.toContain("(t.differenceFromExisting.length >= 40 ? 20 : 0)");
  });

  test("generation is leased and the same claim is required to persist", () => {
    expect(migration).toContain("claim_content_project_generation");
    expect(migration).toContain("generation_lease_until > clock_timestamp()");
    expect(migration).toContain("p_generation_lease_token IS NULL");
    expect(migration).toContain("v_project.current_step <> 'generate'");
    expect(generator).toContain('rpc("claim_content_project_generation"');
    expect(generator).toContain("p_generation_lease_token: generationLeaseToken");
    expect(generator).toContain('rpc("release_content_project_generation"');
    expect(generator).toContain('rpc("renew_content_project_generation"');
    expect(generator).toContain("setTimeout(() => controller.abort(), 75_000)");
  });

  test("derived content gets a new project and never reopens the source", () => {
    const derived = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION create_content_project_derived_draft"),
      migration.indexOf("-- Defence in depth"),
    );
    expect(derived).toContain("INSERT INTO content_projects");
    expect(derived).toContain("v_new_project.id");
    expect(derived).not.toContain("SET\n    current_piece_id = v_piece.id,\n    current_step = 'edit',\n    status = 'active'");
    expect(workflow).toContain("piece.project_id !== project.id");
    expect(workflow).toContain("onProjectChange(derivedProject)");
    expect(studio).toContain("key={activeProject.id}");
  });

  test("VA lifecycle controls are denied in UI, API and database", () => {
    expect(history).toContain('canApprove && piece.status !== "archived"');
    expect(history).toContain('canApprove && piece.status === "archived"');
    expect(pieces).toContain("parsed.data.status !== undefined");
    expect(migration).toContain("v_actor_role NOT IN ('client_admin', 'super_admin')");
    expect(migration).toContain('DROP POLICY IF EXISTS "content_own_client_all"');
    expect(migration).toContain('ON content_pieces FOR SELECT');
  });

  test("conflicts, evidence failures and lost responses have recoverable paths", () => {
    expect(workflow).toContain("error instanceof ApiError && error.statusCode === 409");
    expect(workflow).toContain("Retry loading Vault evidence");
    expect(workflow).toContain("disabled={busy || evidenceLoading || !!evidenceError}");
    expect(workflow).toContain('setRetryOperation({ kind: "patch", updates })');
    expect(workflow).toContain('setRetryOperation({ kind: "quick_draft" })');
    expect(workflow).toContain('setRetryOperation({ kind: "generate" })');
    expect(workflow).toContain("patchProject(retryOperation.updates)");
    expect(workflow).toContain("Draft generated and recovered from the saved project.");
  });
});
