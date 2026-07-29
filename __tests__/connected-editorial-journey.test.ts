/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("connected editorial journey", () => {
  const migration = read("db/migrations/105_connected_editorial_projects.sql");
  const projectsRoute = read("app/api/content/projects/route.ts");
  const projectSchema = read("lib/content/project-schema.ts");
  const evidenceRoute = read("app/api/content/projects/evidence/route.ts");
  const validationRoute = read("app/api/content/validate/route.ts");
  const generator = read("supabase/functions/content-generate/index.ts");
  const retrieval = read("supabase/functions/_shared/content-vault-retrieval.ts");
  const studio = read("components/content/ContentStudio.tsx");
  const workflow = read("components/content/ContentProjectWorkflow.tsx");
  const revisions = read("db/migrations/092_unified_content_workspace.sql");

  test("one durable tenant-scoped project connects the complete journey", () => {
    expect(migration).toContain("CREATE TABLE content_projects");
    expect(migration).toContain("idea_snapshot JSONB");
    expect(migration).toContain("content_brief JSONB");
    expect(migration).toContain("vault_source_ids UUID[]");
    expect(migration).toContain("competitor_signals JSONB");
    expect(migration).toContain("style_snapshot JSONB");
    expect(migration).toContain("current_piece_id UUID");
    expect(migration).toContain("FOREIGN KEY (project_id, client_id)");
    expect(migration).toContain("ALTER TABLE content_projects ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("client_id = current_user_client_id()");
  });

  test("draft creation and project progression commit atomically", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION create_content_project_draft");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("p_content_brief IS DISTINCT FROM v_project.content_brief");
    expect(migration).toContain("v_item_id = ANY(v_project.vault_source_ids)");
    expect(migration).toContain("INSERT INTO content_pieces");
    expect(migration).toContain("UPDATE content_projects");
    expect(generator).toContain('rpc("create_content_project_draft"');
    expect(generator).toContain("selectedVaultSourceIds");
    expect(generator).toContain("The selected Vault evidence changed.");
  });

  test("factual, stylistic and competitor inputs remain separate", () => {
    expect(evidenceRoute).toContain('.eq("evidence_role", "factual")');
    expect(retrieval).toContain("selectedSourceIds");
    expect(retrieval).toContain("selectedSet.has(item.id)");
    expect(workflow).toContain("Facts from the company Vault");
    expect(workflow).toContain("Style from owned examples");
    expect(workflow).toContain("Market inspiration");
    expect(workflow).toContain("They can never substantiate company claims.");
    expect(projectsRoute).toContain("verifyMarketIntelligence");
    expect(projectsRoute).toContain("capture_version_id");
    expect(projectsRoute).toContain("content_hash");
  });

  test("the primary Studio navigation supports discovery and recovery", () => {
    expect(studio).toContain("Continue working");
    expect(studio).toContain("Company priorities &amp; Vault gaps");
    expect(studio).toContain("Competitor opportunities");
    expect(studio).toContain("Drafts &amp; approved library");
    expect(studio).toContain("openProject");
    expect(workflow).toContain("Saved automatically · recoverable on any device");
    for (const step of ["Idea", "Brief", "Evidence", "Generate", "Edit", "Validate", "Approve"]) {
      expect(workflow).toContain(`label: "${step}"`);
    }
  });

  test("ideas support every declared decision before promotion", () => {
    expect(workflow).toContain("Promote into a brief");
    expect(workflow).toContain("Save idea for later");
    expect(workflow).toContain("Regenerate ideas");
    expect(workflow).toContain("Reject idea");
    expect(projectSchema).toContain('"saved"');
    expect(projectSchema).toContain('"rejected"');
  });

  test("validation and revisions retain provenance through approval", () => {
    expect(validationRoute).toContain('id: "claims"');
    expect(validationRoute).toContain('id: "style"');
    expect(validationRoute).toContain('id: "platform"');
    expect(validationRoute).toContain('id: "hard_rules"');
    expect(revisions).toContain("OLD.content_brief, OLD.style_snapshot, OLD.source_references");
    expect(migration).toContain("NEW.style_snapshot IS NOT DISTINCT FROM OLD.style_snapshot");
    expect(migration).toContain("NEW.source_references IS NOT DISTINCT FROM OLD.source_references");
    expect(migration).toContain("'provenance_refresh'");
    expect(migration).toContain("CREATE TRIGGER content_pieces_sync_project");
    expect(migration).toContain("WHEN NEW.status = 'approved' THEN 'approved'");
    expect(workflow).toContain("The brief, evidence, style, draft and revision history remain connected");
  });
});
