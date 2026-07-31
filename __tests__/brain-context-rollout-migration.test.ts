import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/121_brain_context_rollout.sql"),
  "utf8",
);

describe("Brain Context Phase 1 rollout migration", () => {
  it("supports independent per-surface rollback without client-visible access", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS brain_context_feature_flags");
    for (const surface of ["ask", "content", "topics", "tools"]) {
      expect(migration).toContain(`${surface}_enabled BOOLEAN NOT NULL DEFAULT true`);
    }
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE brain_context_feature_flags\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE brain_context_feature_flags");
  });

  it("links generated artifacts to immutable snapshots and enforces tenant scope", () => {
    for (const table of [
      "content_topics",
      "content_projects",
      "content_pieces",
      "tool_runs",
    ]) {
      expect(migration).toContain(`ALTER TABLE ${table}`);
      expect(migration).toContain(`${table}_brain_context_link`);
    }
    expect(migration).toContain(
      "Brain context snapshot is outside the client boundary.",
    );
    expect(migration).toContain(
      "REFERENCES brain_context_snapshots(id) ON DELETE SET NULL",
    );
  });
});
