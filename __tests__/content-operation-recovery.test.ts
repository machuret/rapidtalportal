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

  test("persists competitor failure codes and returns the latest job", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS error_code TEXT");
    expect(migration).toContain(
      "fail_competitor_intelligence_job(UUID, UUID, TEXT, TEXT)",
    );
    expect(intelligence).toContain("last_job");
    expect(intelligence).toContain("p_error_code: code");
  });
});
