import { readFileSync } from "node:fs";
import { join } from "node:path";
import providers from "@/lib/prospecting/providers.json";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("db/migrations/20260803000310_prospecting_provider_health_and_search_dedupe.sql");
const storageMigration = read("db/migrations/20260803000311_prospecting_storage_compaction.sql");
const searchIdentityMigration = read("db/migrations/20260803000314_prospecting_search_identity.sql");
const route = read("app/api/admin/prospecting/providers/route.ts");
const service = read("lib/prospecting/provider-health.ts");
const panel = read("components/admin/ProspectingProviderHealth.tsx");
const campaignRoute = read("app/api/prospecting/campaigns/route.ts");
const cron = read("app/api/cron/prospecting-provider-health/route.ts");
const canary = read(".github/workflows/prospecting-actor-canary.yml");

describe("Lead Generation provider health and storage safety", () => {
  test("exposes a real normalisation smoke test for every configured scraper", () => {
    for (const provider of Object.keys(providers)) {
      expect(service).toContain(`"${provider}"`);
    }
    expect(route).toContain("withSuperAdmin");
    expect(service).toContain("startApifyActorRun");
    expect(service).toContain("normalizeProspectingDataset");
    expect(service).toContain("getProspectingEnrichmentAdapter");
    expect(service).toContain("run.actId !== contract.providerActorId");
    expect(service).toContain('usable > 0 ? "passed" : "failed"');
    expect(panel).toContain("green light means the pinned Actor build ran");
    expect(panel).toContain("Test again");
    expect(panel).toContain("USD $0.50 hard cap");
    expect(cron).toContain("PROSPECTING_PROVIDER_IDS");
    expect(cron).toContain("7 * 24 * 60 * 60_000");
    expect(canary).toContain("google_maps, google_search, linkedin_profiles, website_enrichment");
    expect(canary).toContain("--confirm-spend");
  });

  test("persists check history without exposing it to normal tenant roles", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS prospecting_provider_checks");
    expect(migration).toContain("prospecting_provider_checks_one_active");
    expect(migration).toContain("ALTER TABLE prospecting_provider_checks ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("current_user_role() = 'super_admin'");
    expect(migration).not.toContain("prospecting_provider_checks_tenant_select");
  });

  test("blocks identical active campaigns atomically while preserving intentional reruns", () => {
    expect(migration).toContain("prospecting_campaigns_active_search_unique");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("create_prospecting_campaign_once");
    expect(migration).toContain("'reused', true");
    expect(campaignRoute).toContain("This exact search already exists");
    expect(campaignRoute).toContain("choose Run again");
    expect(searchIdentityMigration).not.toContain("'maxResults', p_max_results");
    expect(searchIdentityMigration).toContain("greatest(max_results, p_max_results)");
    expect(searchIdentityMigration).toContain("duplicate_rank > 1");
  });

  test("caps provider payloads and repeated identity evidence at the database boundary", () => {
    expect(migration).toContain("prospecting_prospects_raw_payload_size");
    expect(migration).toContain("prospecting_capture_raw_payload_size");
    expect(migration).toContain("prospecting_capture_normalized_payload_size");
    expect(migration).toContain("cap_prospecting_merge_evidence");
    expect(migration).toContain("LIMIT 20");
    expect(migration).toContain("jsonb_array_length(evidence) <= 20");
    expect(storageMigration).toContain("reference_latest_prospecting_capture");
    expect(storageMigration).toContain("'captureId', NEW.id");
    expect(storageMigration).toContain("prospecting_enrichment_excerpt_size");
    expect(storageMigration).toContain("cardinality(page_urls) <= 5");
    expect(storageMigration).toContain("prospecting_discovery_captures_super_admin_select");
    expect(storageMigration).not.toContain("prospecting_discovery_captures_super_admin_all\n+");
  });
});
