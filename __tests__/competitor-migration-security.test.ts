/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "095_competitor_source_foundation.sql"),
  "utf8",
);

describe("competitor source foundation migration", () => {
  test.each([
    "competitors",
    "competitor_sources",
    "competitor_crawl_jobs",
    "competitor_content_items",
    "competitor_capture_versions",
  ])("%s has row-level security enabled", (table) => {
    expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  });

  test("every worker function revokes public and authenticated execution", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION claim_competitor_crawl_job[\s\S]+FROM PUBLIC, anon, authenticated/u);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION create_competitor_with_source[\s\S]+FROM PUBLIC, anon, authenticated/u);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION checkpoint_competitor_crawl_job[\s\S]+FROM PUBLIC, anon, authenticated/u);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION upsert_competitor_content_item[\s\S]+FROM PUBLIC, anon, authenticated/u);
  });

  test("active collection jobs have a database uniqueness guard and tokenised leases", () => {
    expect(migration).toContain("competitor_crawl_jobs_one_active_source");
    expect(migration).toContain("lease_token = gen_random_uuid()");
    expect(migration).toContain("AND lease_token = p_lease_token");
  });

  test("parent and tenant identifiers are enforced together by composite foreign keys", () => {
    expect(migration).toContain("REFERENCES competitors(id, client_id) ON DELETE CASCADE");
    expect(migration).toContain("REFERENCES competitor_sources(id, competitor_id, client_id) ON DELETE CASCADE");
    expect(migration).toContain("REFERENCES competitor_content_items(id, source_id, competitor_id, client_id) ON DELETE CASCADE");
  });

  test("captured content is versioned outside the Vault", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS competitor_content_items");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS competitor_capture_versions");
    expect(migration).not.toMatch(/INSERT INTO vault_items/u);
  });
});
