import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWebsiteEnrichmentInput,
  normalizeWebsiteEnrichment,
  WEBSITE_ENRICHMENT_ACTOR,
} from "@/lib/prospecting/enrichment";

describe("Lead Generation Phase 2 company enrichment", () => {
  test("uses a bounded candidate crawl before selecting the five best company pages", () => {
    expect(WEBSITE_ENRICHMENT_ACTOR).toBe("apify/website-content-crawler");
    expect(buildWebsiteEnrichmentInput("https://example.com/about")).toMatchObject({
      startUrls: [{ url: "https://example.com/about" }],
      maxCrawlDepth: 1,
      maxCrawlPages: 5,
      maxResults: 5,
      crawlerType: "cheerio",
      useSitemaps: false,
      saveHtml: false,
    });
  });

  test("normalizes only same-company pages and extracts bounded contact evidence", () => {
    const result = normalizeWebsiteEnrichment("https://example.com", [
      {
        url: "https://example.com/",
        metadata: { title: "Example Finance", description: "Commercial finance for Australian businesses." },
        markdown: "Contact hello@company.com or 02 1234 5678. Follow https://www.linkedin.com/company/example-finance",
      },
      { url: "https://example.com/services", markdown: "Property and private credit services." },
      { url: "https://unrelated.example/about", markdown: "ignore@unrelated.example" },
    ]);
    expect(result.pageCount).toBe(2);
    expect(result.canonicalDomain).toBe("example.com");
    expect(result.emails).toEqual(["hello@company.com"]);
    expect(result.phones).toEqual(["02 1234 5678"]);
    expect(result.socialLinks.linkedin).toBe("https://www.linkedin.com/company/example-finance");
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.contentExcerpt!.length).toBeLessThanOrEqual(5_000);
  });

  test("fails clearly when the provider has no readable same-domain page", () => {
    expect(() => normalizeWebsiteEnrichment("https://example.com", [
      { url: "https://other.example", markdown: "Content" },
    ])).toThrow("no readable company pages");
  });
});

describe("Lead Generation Phase 2 database boundary", () => {
  const migration = readFileSync(
    join(process.cwd(), "db/migrations/20260803000300_prospecting_phase2_qualification.sql"),
    "utf8",
  );
  const hardening = readFileSync(
    join(process.cwd(), "db/migrations/20260803000301_prospecting_phase2_job_isolation.sql"),
    "utf8",
  );
  const foreignKeyCleanup = readFileSync(
    join(process.cwd(), "db/migrations/20260803000302_prospecting_enrichment_fk_cleanup.sql"),
    "utf8",
  );

  test("stores versioned explainable scores and applies deterministic hard caps", () => {
    expect(migration).toContain("prospecting-fit-v1");
    expect(migration).toContain("fit_breakdown");
    expect(migration).toContain("v_excluded_matches > 0");
    expect(migration).toContain("least(v_score, 25)");
    expect(migration).toContain("least(v_score, 49)");
  });

  test("keeps enrichment immutable, tenant-scoped and single-flight", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS prospecting_enrichment_snapshots");
    expect(migration).toContain("prospecting_jobs_one_active_enrichment");
    expect(migration).toContain("prospecting_enrichment_snapshots_tenant_select");
    expect(migration).toContain("REVOKE ALL ON FUNCTION reserve_prospecting_enrichment");
    expect(migration).toContain("REVOKE ALL ON FUNCTION complete_prospecting_enrichment");
  });

  test("isolates enrichment failure state and provider cost from discovery campaigns", () => {
    expect(hardening).toContain("v_job.job_type = 'collection'");
    expect(hardening).toContain("usage_recorded_at");
    expect(hardening).toContain("Company enrichment stopped after repeated provider failures");
    expect(hardening).toContain("AFTER INSERT OR UPDATE OF last_seen_at");
  });

  test("never nulls tenant identity when an enrichment snapshot is removed", () => {
    expect(foreignKeyCleanup).toContain("ON DELETE SET NULL (latest_enrichment_id)");
  });

  test("does not activate person discovery in Phase 2", () => {
    expect(migration).not.toContain("linkedin_profiles");
    const route = readFileSync(join(process.cwd(), "app/api/prospecting/enrich/route.ts"), "utf8");
    expect(route).toContain("assertClientAccess(user");
    expect(route).toContain("startProspectingEnrichment");
  });
});
