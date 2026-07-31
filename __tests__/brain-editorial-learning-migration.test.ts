import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/123_editorial_learning.sql"),
  "utf8",
);

describe("Phase 3 editorial learning migration", () => {
  it("stores immutable editorial lineage with tenant RLS", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS content_editorial_events");
    expect(migration).toContain("event_type IN ('generated','manual_revision','ai_rewrite','submitted','approved')");
    expect(migration).toContain("ALTER TABLE content_editorial_events ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("client_id = current_user_client_id()");
  });

  it("keeps editorial suggestions reviewed and routes factual corrections separately", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS editorial_learning_suggestions");
    expect(migration).toContain("'company_dna_update'");
    expect(migration).toContain("'channel_style_update'");
    expect(migration).toContain("'vault_correction'");
    expect(migration).toContain("Only a client administrator or super administrator can approve permanent learning");
  });

  it("blocks publishing and performance from Brain signals", () => {
    expect(migration).toContain("'publish','published','publication'");
    expect(migration).toContain("'performance','engagement','conversion','clicks','impressions'");
    expect(migration).toContain("Publishing and performance signals are not part of the Brain learning model");
  });

  it("records submission and approval as lineage without creating positive signals", () => {
    const approvalFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION capture_content_approval_event"),
      migration.indexOf("DROP TRIGGER IF EXISTS content_piece_capture_approval_event"),
    );
    const submissionFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION capture_content_submission_event"),
      migration.indexOf("DROP TRIGGER IF EXISTS content_project_capture_submission_event"),
    );
    expect(approvalFunction).toContain("'approved'");
    expect(submissionFunction).toContain("'submitted'");
    expect(approvalFunction).not.toContain("brain_signals");
    expect(submissionFunction).not.toContain("brain_signals");
  });

  it("requires exact lineage before activating an approved editorial lesson", () => {
    const sourceInsert = migration.indexOf("INSERT INTO brain_memory_sources");
    const activation = migration.indexOf("status = 'active'", sourceInsert);
    expect(sourceInsert).toBeGreaterThan(-1);
    expect(activation).toBeGreaterThan(sourceInsert);
  });

  it("does not grant mutation access to authenticated users", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE content_editorial_events FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON TABLE editorial_learning_suggestions FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });
});
