import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS } from "@/lib/migrations/manifest";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/149_notebook_revision_coalescing.sql"),
  "utf8",
);

describe("149_notebook_revision_coalescing", () => {
  test("replaces the page-change trigger function idempotently", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION notebook_on_page_change()");
    // The trigger still snapshots on material content/title changes only.
    expect(migration).toContain("NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title");
  });

  test("coalesces same-editor snapshots inside a 5-minute window", () => {
    // Latest existing revision for the page is probed first.
    expect(migration).toContain("v_latest  notebook_page_revisions%ROWTYPE");
    expect(migration).toContain("WHERE page_id = NEW.id");
    expect(migration).toContain("ORDER BY created_at DESC");
    // Coalesce gate: same editor (NULL-safe) and younger than 5 minutes.
    expect(migration).toContain("v_latest.edited_by IS NOT DISTINCT FROM NEW.last_edited_by");
    expect(migration).toContain("v_latest.created_at > now() - interval '5 minutes'");
  });

  test("updates the latest revision in place instead of always inserting", () => {
    expect(migration).toContain("UPDATE notebook_page_revisions");
    expect(migration).toContain("SET content    = NEW.content");
    expect(migration).toContain("created_at = now()");
    expect(migration).toContain("WHERE id = v_latest.id");
    // The plain-insert path is preserved for new pages / cold bursts.
    expect(migration).toContain(
      "INSERT INTO notebook_page_revisions (page_id, content, title, edited_by)",
    );
    expect(migration).toContain("VALUES (NEW.id, NEW.content, NEW.title, NEW.last_edited_by)");
  });

  test("keeps the editor field and the activity log intact", () => {
    expect(migration).toContain("edited_by");
    expect(migration).toContain("INSERT INTO notebook_activity (placement_id, event, actor_role)");
    expect(migration).toContain("IF v_role IS NOT NULL THEN");
  });

  test("does not touch the 50-revision prune trigger", () => {
    // Pruning lives in notebook_prune_revisions (055) firing AFTER INSERT; this
    // migration must not replace or weaken it.
    expect(migration).not.toContain("notebook_prune_revisions()");
    expect(migration).not.toMatch(/DROP TRIGGER.*notebook_revisions_prune/i);
    expect(migration).not.toContain("DELETE FROM notebook_page_revisions");
  });

  test("self-records and is listed in the manifest", () => {
    expect(migration).toContain(
      "INSERT INTO schema_migrations (version) VALUES ('149_notebook_revision_coalescing.sql')",
    );
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(MIGRATIONS).toContain("149_notebook_revision_coalescing.sql");
  });
});
