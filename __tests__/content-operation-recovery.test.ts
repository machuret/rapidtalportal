/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "..", file), "utf8");

describe("durable content operation recovery", () => {
  const migration = read("db/migrations/118_content_operation_recovery.sql");
  const generateRoute = read("app/api/content/generate/route.ts");
  const workflow = read("components/content/ContentProjectWorkflow.tsx");
  const intelligence = read("app/api/content/competitors/intelligence/route.ts");

  test("persists generation failures and editorial warnings on the project", () => {
    expect(migration).toContain("last_error_message");
    expect(migration).toContain("last_generation_warnings");
    expect(generateRoute).toContain("last_error_code");
    expect(generateRoute).toContain("last_generation_warnings");
    expect(workflow).toContain("Retry generation");
    expect(workflow).toContain("Your project, brief and selected Vault knowledge remain saved.");
  });

  test("every read path returns the recovery fields — the retry UI is dead without them", () => {
    // The exact blind spot that shipped: writes existed, selects didn't.
    const projectsRoute = read("app/api/content/projects/route.ts");
    const loaders = read("lib/content/server.ts");
    for (const field of ["last_operation", "last_error_code", "last_error_message", "last_error_at", "last_generation_warnings"]) {
      expect(projectsRoute).toContain(field);
      expect(loaders).toContain(field);
    }
    // GET single/list and the PATCH response must all include the snapshot link too.
    expect(projectsRoute).toContain("brain_context_snapshot_id");
  });

  test("persists competitor failure codes and returns the latest job", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS error_code TEXT");
    expect(migration).toContain(
      "fail_competitor_intelligence_job(UUID, UUID, TEXT, TEXT)",
    );
    expect(intelligence).toContain("last_job");
    expect(intelligence).toContain("p_error_code: code");
  });
});
