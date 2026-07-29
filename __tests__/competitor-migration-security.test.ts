/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "095_competitor_source_foundation.sql"),
  "utf8",
);
const reliabilityMigration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "096_competitor_ingestion_reliability.sql"),
  "utf8",
);
const discoveryBudgetMigration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "097_competitor_discovery_budget.sql"),
  "utf8",
);
const readinessMigration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "099_competitor_intelligence_readiness.sql"),
  "utf8",
);
const linkedinDiscoveryMigration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "100_linkedin_public_post_discovery.sql"),
  "utf8",
);
const intelligenceRunsMigration = readFileSync(
  path.resolve(__dirname, "..", "db", "migrations", "102_competitor_intelligence_runs.sql"),
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

describe("competitor ingestion reliability migration", () => {
  test("durably stages provider pages and tracks crawl generations", () => {
    expect(reliabilityMigration).toContain("CREATE TABLE IF NOT EXISTS competitor_crawl_pages");
    expect(reliabilityMigration).toContain("last_seen_generation");
    expect(reliabilityMigration).toContain("last_seen_generation IS DISTINCT FROM v_job.generation_id");
  });

  test("reserves hard tenant budgets in the same transaction as job creation", () => {
    expect(reliabilityMigration).toContain("CREATE TABLE IF NOT EXISTS competitor_crawl_usage");
    expect(reliabilityMigration).toContain("Daily competitor collection budget reached.");
    expect(reliabilityMigration).toMatch(/RETURN QUERY\s+INSERT INTO competitor_crawl_jobs/u);
  });

  test("counts bounded sitemap and feed discovery in the provider-page budget", () => {
    expect(discoveryBudgetMigration).toContain("p_pages_requested > 112");
    expect(discoveryBudgetMigration).toContain("pages_reserved + p_pages_requested");
    expect(discoveryBudgetMigration).toContain("FROM PUBLIC, anon, authenticated");
  });

  test("all new worker functions are service-role only", () => {
    for (const name of [
      "create_competitor_crawl_job",
      "stage_competitor_crawl_pages",
      "commit_competitor_crawl_page",
      "finalize_competitor_crawl_job",
    ]) {
      expect(reliabilityMigration).toContain(
        `REVOKE ALL ON FUNCTION ${name}`,
      );
    }
  });
});

describe("competitor intelligence readiness migration", () => {
  test("readiness is tenant-qualified and service-role only", () => {
    expect(readinessMigration).toContain("WHERE c.client_id = p_client_id");
    expect(readinessMigration).toContain("WHERE ci.client_id = p_client_id");
    expect(readinessMigration).toMatch(
      /REVOKE ALL ON FUNCTION competitor_intelligence_readiness\(UUID\)[\s\S]+FROM PUBLIC, anon, authenticated/u,
    );
    expect(readinessMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION competitor_intelligence_readiness\(UUID\)[\s\S]+TO service_role/u,
    );
  });

  test("requires enough recent evidence before idea generation", () => {
    expect(readinessMigration).toContain("m.captured_items >= 5");
    expect(readinessMigration).toContain("m.content_characters >= 3000");
    expect(readinessMigration).toContain("m.latest_capture >= now() - interval '180 days'");
  });
});

describe("LinkedIn public post discovery migration", () => {
  test("activates only public company posts feeds and keeps readiness private", () => {
    expect(linkedinDiscoveryMigration).toContain("linkedin\\.com/company/");
    expect(linkedinDiscoveryMigration).toContain("/posts/?");
    expect(linkedinDiscoveryMigration).toContain("IN ('social_post', 'social_feed')");
    expect(linkedinDiscoveryMigration).toMatch(
      /REVOKE ALL ON FUNCTION competitor_intelligence_readiness\(UUID\)[\s\S]+FROM PUBLIC, anon, authenticated/u,
    );
  });
});

describe("competitor intelligence runs migration", () => {
  test("keeps durable analysis service-role only", () => {
    expect(intelligenceRunsMigration).toContain(
      "ALTER TABLE competitor_intelligence_runs ENABLE ROW LEVEL SECURITY",
    );
    expect(intelligenceRunsMigration).toContain(
      "REVOKE ALL ON TABLE competitor_intelligence_runs FROM PUBLIC, anon, authenticated",
    );
    expect(intelligenceRunsMigration).toMatch(
      /REVOKE ALL ON FUNCTION replace_competitor_intelligence_run[\s\S]+FROM PUBLIC, anon, authenticated/u,
    );
  });

  test("atomically supersedes the old report before inserting its replacement", () => {
    expect(intelligenceRunsMigration).toContain("PERFORM id FROM clients WHERE id = p_client_id FOR UPDATE");
    expect(intelligenceRunsMigration).toContain("SET status = 'superseded'");
    expect(intelligenceRunsMigration).toContain("RETURNING * INTO v_run");
  });

  test("requires bounded source provenance and a versioned report", () => {
    expect(intelligenceRunsMigration).toContain("schema_version INTEGER NOT NULL DEFAULT 1");
    expect(intelligenceRunsMigration).toContain("source_count = cardinality(source_item_ids)");
    expect(intelligenceRunsMigration).toContain("cardinality(source_item_ids) BETWEEN 3 AND 80");
    expect(intelligenceRunsMigration).toContain("WHERE client_id = p_client_id");
    expect(intelligenceRunsMigration).toContain("competitor_id = ANY(p_competitor_ids)");
    expect(intelligenceRunsMigration).toContain("id = ANY(p_source_item_ids)");
  });
});
