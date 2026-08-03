import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProspectingAdapter } from "@/lib/prospecting/adapters";
import { buildWebsiteEnrichmentInput, normalizeWebsiteEnrichment } from "@/lib/prospecting/enrichment";
import { providerInputBuilders } from "@/lib/prospecting/provider-inputs.mjs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Lead Generation modularity and regression audit", () => {
  test("accepts canonical redirects and prioritises useful pages from a larger candidate pool", () => {
    const filler = Array.from({ length: 7 }, (_, index) => ({
      url: `https://portal.example.com/misc-${index}`,
      markdown: `Miscellaneous page ${index}`,
    }));
    const result = normalizeWebsiteEnrichment("http://example.com", [
      ...filler,
      { url: "https://portal.example.com/contact", markdown: "Contact us on 02 9123 4567" },
      { url: "https://portal.example.com/services", markdown: "Our advisory services" },
      { url: "https://portal.example.com/about", markdown: "About the company" },
      { url: "https://portal.example.com/", markdown: "Company home" },
    ]);
    expect(result.pageUrls.slice(0, 4)).toEqual([
      "https://portal.example.com/",
      "https://portal.example.com/about",
      "https://portal.example.com/services",
      "https://portal.example.com/contact",
    ]);
    expect(result.pageUrls).toHaveLength(5);
  });

  test("allows HTTP, HTTPS, apex, www and other same-company subdomain crawl candidates", () => {
    const input = buildWebsiteEnrichmentInput("http://www.example.com") as {
      includeUrlGlobs: string[]; maxCrawlPages: number; maxResults: number;
    };
    expect(input.includeUrlGlobs).toEqual(expect.arrayContaining([
      "http://example.com/about/**",
      "https://www.example.com/services/**",
      "https://*.example.com/contact/**",
    ]));
    expect(input.maxCrawlPages).toBe(5);
    expect(input.maxResults).toBe(5);
  });

  test("uses the exact production input builders in adapters and Actor Lab", () => {
    const criteria = {
      queries: ["accountant"], locations: ["Sydney, Australia"], maxResults: 20,
      countryCode: "au", languageCode: "en",
    };
    expect(getProspectingAdapter("google_maps").buildInput(criteria))
      .toEqual(providerInputBuilders.google_maps(criteria));
    expect(getProspectingAdapter("google_search").buildInput(criteria))
      .toEqual(providerInputBuilders.google_search(criteria));
    const actorLab = read("scripts/prospecting-actor-lab.mjs");
    expect(actorLab).toContain("providerInputBuilders[source]");
    expect(actorLab).toContain('actorId.replace(/\\//gu, "~")');
    expect(actorLab).toContain('argument("website-url"');
    expect(actorLab).not.toContain("const definitions");
  });

  test("isolates provider normalisation behind one adapter registry", () => {
    const registry = read("lib/prospecting/adapters.ts");
    expect(registry.split("\n").length).toBeLessThan(60);
    expect(registry).toContain("providers/google-maps");
    expect(registry).toContain("providers/google-search");
    expect(registry).toContain("providers/linkedin-profiles");
    expect(read("lib/prospecting/providers/google-maps.ts")).toContain('source: "google_maps"');
    expect(read("lib/prospecting/providers/google-search.ts")).toContain('source: "google_search"');
    expect(read("lib/prospecting/providers/linkedin-profiles.ts")).toContain('source: "linkedin_profiles"');
  });

  test("dispatches completion through job-type handlers instead of the general orchestrator", () => {
    const jobs = read("lib/prospecting/jobs.ts");
    const advancement = read("lib/prospecting/job-advance.ts");
    const handlers = read("lib/prospecting/job-completion-handlers.ts");
    expect(jobs).toContain("Stable public facade");
    expect(advancement).toContain("completeProspectingJob(db, claimed, run)");
    expect(jobs).not.toContain("getApifyDatasetItems");
    expect(handlers).toContain("prospectingJobCompletionHandlers");
    expect(handlers).toContain("collection: completeCollection");
    expect(handlers).toContain("enrichment: completeEnrichment");
  });

  test("starts jobs atomically, preserves immutable input and refunds definitive no-run failures", () => {
    const starts = read("lib/prospecting/job-start.ts");
    const migration = read("db/migrations/20260803000312_prospecting_collaboration_and_atomic_start.sql");
    expect(starts).toContain('db.rpc("reserve_prepare_claim_prospecting_job"');
    expect(starts).toContain('db.rpc("reserve_prepare_claim_prospecting_enrichment"');
    expect(migration).toContain("protect_prospecting_job_input_snapshot");
    expect(migration).toContain("Prospecting provider input snapshots are immutable.");
    expect(migration).toContain("actor_run_id IS NOT NULL OR v_job.reservation_released_at IS NOT NULL");
  });

  test("keeps the latest enrichment attempt visible after it becomes terminal", () => {
    const migration = read("db/migrations/20260803000313_prospecting_enrichment_attempt_visibility.sql");
    const leadsRoute = read("app/api/prospecting/leads/route.ts");
    const inbox = read("components/prospecting/LeadInbox.tsx");
    expect(migration).toContain("latest_enrichment_job_id");
    expect(migration).toContain("remember_latest_prospecting_enrichment_job");
    expect(leadsRoute).toContain("latest_enrichment_job:");
    expect(inbox).toContain("Company enrichment did not finish");
  });

  test("verifies webhook actors, rate-limits creation and supports collaboration history", () => {
    const webhook = read("app/api/webhooks/prospecting/apify/route.ts");
    const campaigns = read("app/api/prospecting/campaigns/route.ts");
    const leads = read("app/api/prospecting/leads/route.ts");
    const workspace = read("components/prospecting/LeadGenerationWorkspace.tsx");
    const inbox = read("components/prospecting/LeadInbox.tsx");
    const campaignManager = read("components/prospecting/CampaignManager.tsx");
    const timeline = read("components/prospecting/ProspectingActivityTimeline.tsx");
    expect(webhook).toContain("p_actor_provider_id: run.actId");
    expect(campaigns).toContain("leadCampaignMutationLimiter.check");
    expect(campaigns).toContain("update_prospecting_campaign_workflow");
    expect(leads).toContain("update_prospecting_lead_workflow");
    expect(workspace).toContain("ProspectingActivityTimeline");
    expect(timeline).toContain("Team activity");
    expect(inbox).toContain("Assign lead");
    expect(campaignManager).toContain("Campaign owner");
  });

  test("keeps orchestration and presentation behind stable, typed module boundaries", () => {
    const jobs = read("lib/prospecting/jobs.ts");
    const workspace = read("components/prospecting/LeadGenerationWorkspace.tsx");
    const activity = read("lib/prospecting/activity.ts");
    const providerInputs = read("lib/prospecting/provider-inputs.mjs");
    expect(jobs.split("\n").length).toBeLessThan(30);
    expect(workspace.split("\n").length).toBeLessThan(650);
    expect(workspace).toContain("<LeadSearchForm");
    expect(workspace).toContain("<LeadInbox");
    expect(workspace).toContain("<CampaignManager");
    expect(activity).toContain("ProspectingActivityEventType");
    expect(activity).toContain("prospectingActivityLabel");
    expect(providerInputs).toContain("// @ts-check");
    expect(() => read("lib/prospecting/provider-inputs.d.ts")).toThrow();
  });
});
