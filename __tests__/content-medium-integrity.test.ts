/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("Content Studio medium-priority integrity repairs", () => {
  const loaders = read("lib/content/server.ts");
  const projectsPage = read("components/content/ProjectsPage.tsx");
  const history = [
    "components/content/library/HistoryTab.tsx",
    "components/content/library/PieceDetailEditor.tsx",
    "components/content/library/usePieceActions.ts",
  ].map(read).join("\n");
  const projects = read("app/api/content/projects/route.ts");
  const pieces = read("app/api/content/pieces/route.ts");
  const validation = read("app/api/content/validate/route.ts");
  const migration = read("db/migrations/114_content_workflow_validation_integrity.sql");
  const versionClock = read("db/migrations/115_content_piece_version_clock.sql");
  const ingestion = read("lib/competitors/ingestion.ts");
  const roles = read("e2e/content-studio-roles.spec.ts");
  const quality = read("supabase/functions/_shared/content-quality.ts");

  test("history, projects and project artifacts expose recoverable pagination", () => {
    expect(loaders).toContain("limit = 51");
    expect(loaders).toContain("limit = 201");
    expect(pieces).toContain("nextOffset");
    expect(projects).toContain("pieces_next_offset");
    expect(history).toContain("Load older content");
    expect(projectsPage).toContain("Load older projects");
    expect(history).toContain("onLoadMore");
  });

  test("history detail errors stay visible and paid derived actions are locked", () => {
    expect(history).toContain("This content could not be opened.");
    expect(history).toContain("detailQuery.refetch()");
    expect(history).toContain("derivedActionRef.current");
    expect(history).toContain('setDerivedAction("duplicate")');
    expect(history).toContain('setDerivedAction("adapt")');
  });

  test("validation is persisted against exact draft and DNA versions", () => {
    expect(validation).toContain('rpc("record_content_project_validation"');
    expect(validation).toContain("p_expected_piece_updated_at: piece.updated_at");
    expect(projects).toContain('rpc("content_project_validation_is_current"');
    expect(migration).toContain("piece_updated_at = piece.updated_at");
    expect(migration).toContain("dna_updated_at = dna.updated_at");
    expect(migration).toContain("content_projects_step_guard");
    expect(migration).toContain("content_pieces_connected_validation_guard");
    expect(versionClock).toContain("content_pieces_touch_updated_at");
    expect(versionClock).toContain("NEW.body IS DISTINCT FROM OLD.body");
  });

  test("provider requests are bounded and the full UI page budget is accepted", () => {
    expect(ingestion).toContain("AbortSignal.timeout");
    expect(ingestion).toContain("FIRECRAWL_HTTP_TIMEOUT_MS");
    expect(ingestion).toContain("APIFY_HTTP_TIMEOUT_MS");
    expect(migration).toContain("p_pages_requested > 112");
  });

  test("scheduled role test and platform cardinality match production contracts", () => {
    expect(roles).toContain('["done", "error", "cancelled"]');
    expect(roles).toContain('toBe("done")');
    expect(quality).toContain("Instagram caption cannot be empty.");
    expect(quality).toContain("Instagram requires exactly one");
    expect(quality).toContain('requireExactCtaCount(warnings, trimmed, "Blog")');
  });
});
