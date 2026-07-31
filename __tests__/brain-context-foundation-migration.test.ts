import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/120_brain_context_foundation.sql"),
  "utf8",
);

describe("Brain Context Phase 0 database foundation", () => {
  test("stores immutable versioned context with a database-generated SHA-256 hash", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS brain_context_snapshots");
    expect(migration).toContain("version = 'brain-context-v1'");
    expect(migration).toContain("resolver_version = 'resolver-v1'");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION set_brain_context_snapshot_hash()");
    expect(migration).toContain("extensions.digest(convert_to(NEW.snapshot::TEXT, 'UTF8'), 'sha256')");
    expect(migration).toContain("BEFORE INSERT ON brain_context_snapshots");
    expect(migration).toContain("snapshot->>'clientId' = client_id::TEXT");
    expect(migration).toContain("(snapshot->'request') = request");
  });

  test("provides a current-orchestration baseline library", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS brain_evaluation_cases");
    expect(migration).toContain("'ask', 'content_idea', 'content_draft', 'tool'");
    expect(migration).toContain("baseline_context_snapshot_id UUID");
    expect(migration).toContain("baseline_prompt_version TEXT");
    expect(migration).toContain("UNIQUE (client_id, name)");
  });

  test("keeps Phase 0 storage behind service-role APIs", () => {
    for (const table of ["brain_context_snapshots", "brain_evaluation_cases"]) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(
        `REVOKE ALL ON TABLE ${table} FROM PUBLIC, anon, authenticated`,
      );
    }
    expect(migration).toContain(
      "REVOKE ALL ON TABLE brain_context_snapshots FROM service_role",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT ON TABLE brain_context_snapshots TO service_role",
    );
    expect(migration).toContain(
      "GRANT ALL ON TABLE brain_evaluation_cases TO service_role",
    );
  });
});
