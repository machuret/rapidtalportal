import { readFileSync } from "node:fs";
import { join } from "node:path";
import providers from "@/lib/prospecting/providers.json";
import { getProspectingAdapter } from "@/lib/prospecting/adapters";
import { normalizeWebsiteEnrichment } from "@/lib/prospecting/enrichment";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Lead Generation provider reliability", () => {
  test("pins every provider used by production and shares it with the Actor Lab", () => {
    for (const provider of Object.values(providers)) {
      expect(provider.build).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(provider.build).not.toBe("latest");
      expect(provider.providerActorId).toMatch(/^[A-Za-z0-9_-]{5,100}$/u);
    }
    const lab = read("scripts/prospecting-actor-lab.mjs");
    expect(lab).toContain("providers.json");
    expect(lab).toContain("build: providerCatalog[source].build");
  });

  test("retains conservative identity signals instead of discarding secondary keys", () => {
    const rows = getProspectingAdapter("google_maps").normalize({
      title: "Example Finance",
      placeId: "place-123",
      website: "https://example.com",
      phone: "+61 2 9999 9999",
      address: "1 Example Street, Sydney",
    }, { providerRunId: "run-1", actorBuildId: "build-1" });
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKeys.length).toBeGreaterThan(1);
    expect(rows[0].identitySignals.map((signal) => signal.type)).toEqual(
      expect.arrayContaining(["google_place", "domain", "phone", "name_address"]),
    );
    expect(rows[0].identitySignals.filter((signal) => signal.primary)).toHaveLength(1);
  });

  test("normalizes common canonical redirects and hashes pages deterministically", () => {
    const pages = [
      { url: "https://www.example.com/contact", markdown: "Call 02 1234 5678" },
      { url: "https://www.example.com/", metadata: { title: "Example" }, markdown: "Example company" },
      { url: "https://www.example.com/about", markdown: "About Example" },
    ];
    const first = normalizeWebsiteEnrichment("http://example.com", pages);
    const second = normalizeWebsiteEnrichment("http://example.com", [...pages].reverse());
    expect(first.pageUrls[0]).toBe("https://www.example.com/");
    expect(first.pageUrls[1]).toBe("https://www.example.com/about");
    expect(first.contentHash).toBe(second.contentHash);
  });
});

describe("Lead Generation durable lifecycle", () => {
  test("keeps paid advancement server-owned and selects due recovery work before limiting", () => {
    const workspace = read("components/prospecting/LeadGenerationWorkspace.tsx");
    expect(workspace).not.toContain("ROUTES.prospecting.advance()");
    const cron = read("app/api/cron/prospecting-jobs/route.ts");
    expect(cron).toContain("next_attempt_at.lte");
    expect(cron).toContain(".limit(8)");
    expect(cron).not.toContain(".limit(50)");
  });

  test("persists exact provider contracts and rejects mismatched webhook Actors", () => {
    const migration = read("db/migrations/20260803000305_prospecting_provider_contracts.sql");
    expect(migration).toContain("actor_build_requested");
    expect(migration).toContain("input_payload");
    expect(migration).toContain("input_hash");
    expect(migration).toContain("Provider Actor does not match this job.");
    const webhook = read("app/api/webhooks/prospecting/apify/route.ts");
    expect(webhook).toContain("reconcile_prospecting_provider_run_v2");
    expect(webhook).toContain("p_actor_provider_id: run.actId");
  });

  test("stores immutable captures, aliases and reviewable merge suggestions", () => {
    const migration = read("db/migrations/20260803000307_prospecting_discovery_provenance.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS prospecting_discovery_captures");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS prospecting_identity_aliases");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS prospecting_merge_suggestions");
    expect(migration).toContain("field_provenance");
    expect(migration).toContain("ingest_prospecting_job_results_v2");
    expect(migration).toContain("extensions.digest(convert_to");
  });

  test("uses phrase-aware and source-aware qualification", () => {
    const migration = read("db/migrations/20260803000306_prospecting_source_aware_scoring.sql");
    expect(migration).toContain("phraseto_tsquery");
    expect(migration).not.toContain("LIKE '%' || term || '%'");
    expect(migration).toContain("v_rating_applicable := v_campaign.source = 'google_maps'");
    expect(migration).toContain("prospecting-fit-v3");
    expect(migration).toContain("ARRAY[]::TEXT[]");
  });
});
