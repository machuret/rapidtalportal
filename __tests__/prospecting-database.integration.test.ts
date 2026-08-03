/**
 * Live staging acceptance for Lead Generation's real database boundary.
 *
 * Requires disposable staging tenant credentials:
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * PROSPECTING_TEST_CLIENT_ID, PROSPECTING_TEST_ACTOR_ID,
 * PROSPECTING_TEST_TENANT_JWT, PROSPECTING_TEST_OTHER_TENANT_JWT.
 *
 * The test creates uniquely marked rows, exercises two concurrent ingestions
 * and CRM promotions, proves browser-role RLS, and cleans up in finally.
 */
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

const {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  PROSPECTING_TEST_CLIENT_ID: CLIENT_ID,
  PROSPECTING_TEST_ACTOR_ID: ACTOR_ID,
  PROSPECTING_TEST_TENANT_JWT: TENANT_JWT,
  PROSPECTING_TEST_OTHER_TENANT_JWT: OTHER_TENANT_JWT,
} = process.env;
const ready = Boolean(URL && ANON_KEY && SERVICE_KEY && CLIENT_ID && ACTOR_ID && TENANT_JWT && OTHER_TENANT_JWT);
const live = ready ? describe : describe.skip;

live("Prospecting live RLS and concurrency", () => {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = ready ? createClient<Database>(URL!, SERVICE_KEY!, options) : null;
  const tenant = ready ? createClient<Database>(URL!, ANON_KEY!, {
    ...options,
    global: { headers: { Authorization: `Bearer ${TENANT_JWT}` } },
  }) : null;
  const otherTenant = ready ? createClient<Database>(URL!, ANON_KEY!, {
    ...options,
    global: { headers: { Authorization: `Bearer ${OTHER_TENANT_JWT}` } },
  }) : null;

  test("deduplicates concurrent results, promotes once and rejects browser writes/cross-tenant reads", async () => {
    const marker = randomUUID();
    const canonicalKey = createHash("sha256").update(marker).digest("hex");
    const campaignIds = [randomUUID(), randomUUID()];
    const jobIds = [randomUUID(), randomUUID()];
    const createdContactIds: string[] = [];
    let prospectId: string | null = null;
    try {
      const campaigns = await admin!.from("prospecting_campaigns").insert(campaignIds.map((id, index) => ({
        id,
        client_id: CLIENT_ID!,
        name: `Prospecting acceptance ${marker} ${index}`,
        source: "google_maps",
        queries: ["accountant"],
        locations: ["Sydney"],
        max_results: 1,
        ideal_profile: {
          requiredKeywords: [], preferredKeywords: [], excludedKeywords: [],
          minRating: 5, minReviewCount: 1000, mustHaveWebsite: false,
        },
        created_by: ACTOR_ID!,
      })));
      expect(campaigns.error).toBeNull();
      const jobs = await admin!.from("prospecting_jobs").insert(jobIds.map((id, index) => ({
        id,
        campaign_id: campaignIds[index],
        client_id: CLIENT_ID!,
        source: "google_maps",
        actor_id: "acceptance~actor",
        actor_provider_id: "nwua9Gu5YrADL7ZDj",
        actor_build_requested: "0.14.723",
        actor_run_id: `acceptance-run-${marker}-${index}`,
        actor_dataset_id: `acceptance-data-${marker}-${index}`,
        adapter_version: 1,
        requested_results: 1,
        max_charge_usd: 0.5,
        status: "running",
        created_by: ACTOR_ID!,
      })));
      expect(jobs.error).toBeNull();

      const claims = await Promise.all(jobIds.map((jobId) => admin!.rpc("claim_prospecting_job", {
        p_job_id: jobId,
        p_client_id: CLIENT_ID!,
        p_lease_seconds: 120,
      })));
      expect(claims.every((claim) => !claim.error && claim.data?.[0]?.lease_token)).toBe(true);
      const payload = [{
        kind: "company",
        canonicalKey,
        dedupeKeys: [canonicalKey],
        identitySignals: [{ type: "domain", key: canonicalKey, primary: true }],
        companyName: `Acceptance Company ${marker}`,
        websiteUrl: "https://acceptance.invalid",
        sourceUrl: "https://maps.invalid/acceptance",
        source: {
          source: "google_maps",
          actorId: "acceptance~actor",
          actorBuildId: "acceptance-build",
          providerRunId: `acceptance-run-${marker}`,
          adapterVersion: 1,
          capturedAt: new Date().toISOString(),
        },
        raw: { acceptance: true },
      }] as unknown as Json;
      const ingestions = await Promise.all(jobIds.map((jobId, index) => admin!.rpc("ingest_prospecting_job_results_v2", {
        p_job_id: jobId,
        p_lease_token: claims[index].data![0].lease_token!,
        p_results: payload,
        p_usage_total_usd: 0,
      })));
      expect(ingestions.every((ingestion) => !ingestion.error && ingestion.data?.[0]?.status === "done")).toBe(true);

      const prospects = await admin!.from("prospecting_prospects")
        .select("id").eq("client_id", CLIENT_ID!).eq("canonical_key", canonicalKey);
      expect(prospects.error).toBeNull();
      expect(prospects.data).toHaveLength(1);
      prospectId = prospects.data![0].id;
      const leads = await admin!.from("prospecting_campaign_leads")
        .select("id, fit_score, fit_band, score_version").eq("client_id", CLIENT_ID!).eq("prospect_id", prospectId);
      expect(leads.data).toHaveLength(2);
      expect(leads.data!.every((lead) => lead.fit_score !== null && lead.score_version === "prospecting-fit-v3")).toBe(true);
      expect(leads.data!.every((lead) => lead.fit_band === "weak" && lead.fit_score! <= 49)).toBe(true);
      const captures = await admin!.from("prospecting_discovery_captures")
        .select("id, prospect_id, payload_hash").eq("client_id", CLIENT_ID!).eq("prospect_id", prospectId);
      expect(captures.error).toBeNull();
      expect(captures.data).toHaveLength(2);
      expect(captures.data!.every((capture) => capture.payload_hash.length === 64)).toBe(true);
      const aliases = await admin!.from("prospecting_identity_aliases")
        .select("id, prospect_id, identity_key").eq("client_id", CLIENT_ID!).eq("prospect_id", prospectId);
      expect(aliases.error).toBeNull();
      expect(aliases.data).toHaveLength(1);

      const reservations = await Promise.all([0, 1].map(() => admin!.rpc("reserve_prospecting_enrichment", {
        p_lead_id: leads.data![0].id,
        p_client_id: CLIENT_ID!,
        p_actor_id: ACTOR_ID!,
        p_actor_identifier: "apify~website-content-crawler",
        p_adapter_version: 1,
        p_max_charge_usd: 0.5,
        p_daily_enrichment_limit: 500,
      })));
      expect(reservations.filter((reservation) => !reservation.error && reservation.data?.length === 1)).toHaveLength(1);
      expect(reservations.filter((reservation) => reservation.error)).toHaveLength(1);
      const reserved = reservations.find((reservation) => !reservation.error)?.data?.[0];
      const released = await admin!.rpc("release_prospecting_enrichment_reservation", {
        p_job_id: reserved!.id,
        p_client_id: CLIENT_ID!,
        p_error_code: "acceptance_release",
        p_error_message: "Acceptance test release",
      });
      expect(released.error).toBeNull();
      expect(released.data?.[0]?.status).toBe("error");
      expect(released.data?.[0]?.reservation_released_at).toBeTruthy();

      const promotions = await Promise.all(leads.data!.map((lead) => admin!.rpc("promote_prospecting_lead_to_crm", {
        p_campaign_lead_id: lead.id,
        p_client_id: CLIENT_ID!,
        p_actor_id: ACTOR_ID!,
      })));
      expect(promotions.every((promotion) => !promotion.error && promotion.data)).toBe(true);
      expect(new Set(promotions.map((promotion) => promotion.data)).size).toBe(1);
      createdContactIds.push(promotions[0].data!);

      const ownRead = await tenant!.from("prospecting_campaigns").select("id").in("id", campaignIds);
      expect(ownRead.error).toBeNull();
      expect(ownRead.data).toHaveLength(2);
      const ownWrite = await tenant!.from("prospecting_campaigns")
        .update({ name: "RLS bypass" }).eq("id", campaignIds[0]).select("id");
      expect(ownWrite.error || ownWrite.data?.length === 0).toBeTruthy();
      const crossTenantRead = await otherTenant!.from("prospecting_campaigns").select("id").in("id", campaignIds);
      expect(crossTenantRead.error).toBeNull();
      expect(crossTenantRead.data).toHaveLength(0);
    } finally {
      await admin!.from("prospecting_campaigns").delete().in("id", campaignIds);
      if (prospectId) await admin!.from("prospecting_prospects").delete().eq("id", prospectId);
      if (createdContactIds.length) await admin!.from("crm_contacts").delete().in("id", createdContactIds);
    }
  });
});
