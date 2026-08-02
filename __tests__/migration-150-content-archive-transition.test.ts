/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/20260803000150_allow_content_archive_transition.sql"),
  "utf8",
);

describe("content archive project transition", () => {
  test("allows an explicit archive to terminate a connected project from any editorial step", () => {
    expect(migration).toContain("NEW.status = 'archived' AND NEW.current_step = 'complete'");
    expect(migration.indexOf("NEW.status = 'archived'")).toBeLessThan(
      migration.indexOf("v_allowed := CASE OLD.current_step"),
    );
  });

  test("preserves validation and normal workflow transition enforcement", () => {
    expect(migration).toContain("content_project_validation_is_current(");
    expect(migration).toContain("Invalid content workflow transition from %s to %s.");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });
});
