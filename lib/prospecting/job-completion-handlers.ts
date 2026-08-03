import type { SupabaseClient } from "@supabase/supabase-js";
import { getApifyDatasetItems } from "@/lib/prospecting/apify-client";
import { normalizeProspectingDataset } from "@/lib/prospecting/adapters";
import { getProspectingEnrichmentAdapter } from "@/lib/prospecting/enrichment";
import { ProspectingJobError } from "@/lib/prospecting/job-errors";
import type { ApifyActorRun } from "@/lib/prospecting/types";
import type { Database, Json } from "@/types/database";
import type { ProspectingCampaign, ProspectingJob } from "@/types/prospecting";

type ProspectingDb = SupabaseClient<Database>;
type ClaimedJob = ProspectingJob & { lease_token: string };

function one<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function boundedRaw(value: Record<string, unknown>): Record<string, unknown> {
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= 20_000) return value;
    return { truncated: true, originalCharacters: encoded.length, observedFields: Object.keys(value).sort() };
  } catch {
    return { unavailable: true };
  }
}

async function completeEnrichment(
  db: ProspectingDb,
  job: ClaimedJob,
  run: ApifyActorRun,
): Promise<ProspectingJob> {
  const { data: leadRow, error: leadError } = await db
    .from("prospecting_campaign_leads")
    .select("id, client_id, prospecting_prospects!inner(website_url)")
    .eq("id", job.lead_id!)
    .eq("client_id", job.client_id)
    .single();
  if (leadError || !leadRow) throw new ProspectingJobError("Lead not found.", 404);
  const embedded = leadRow.prospecting_prospects as unknown as { website_url: string | null };
  if (!embedded.website_url) throw new ProspectingJobError("This lead has no website to enrich.", 422);
  const datasetItems = await getApifyDatasetItems(run.defaultDatasetId!, { limit: 25 });
  let enrichment;
  try {
    enrichment = getProspectingEnrichmentAdapter("website_enrichment").normalize(embedded.website_url, datasetItems);
  } catch (error) {
    throw new ProspectingJobError(
      error instanceof Error ? error.message : "The website did not return usable company information.",
      422,
      false,
    );
  }
  const { data, error } = await db.rpc("complete_prospecting_enrichment", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_enrichment: JSON.parse(JSON.stringify(enrichment)) as Json,
    p_usage_total_usd: run.usageTotalUsd,
  });
  const completed = one(data as ProspectingJob[] | null);
  if (error || !completed) throw new ProspectingJobError("The enriched company details could not be saved. The job can be retried.", 500, true);
  return completed;
}

async function completeCollection(
  db: ProspectingDb,
  job: ClaimedJob,
  run: ApifyActorRun,
): Promise<ProspectingJob> {
  const { data: campaign, error: campaignError } = await db
    .from("prospecting_campaigns").select("*")
    .eq("id", job.campaign_id).eq("client_id", job.client_id).single();
  if (campaignError || !campaign) throw new ProspectingJobError("Campaign not found.", 404);
  const datasetItems = await getApifyDatasetItems(run.defaultDatasetId!, { limit: 100 });
  const results = normalizeProspectingDataset(
    job.source as ProspectingCampaign["source"],
    datasetItems,
    { providerRunId: run.id, actorBuildId: run.buildId, capturedAt: new Date().toISOString() },
    job.requested_results,
  ).map((row) => ({ ...row, raw: boundedRaw(row.raw) }));
  const { data, error } = await db.rpc("ingest_prospecting_job_results_v2", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_results: JSON.parse(JSON.stringify(results)) as Json,
    p_usage_total_usd: run.usageTotalUsd,
  });
  const completed = one(data as ProspectingJob[] | null);
  if (error || !completed) throw new ProspectingJobError("The collected leads could not be saved. The job can be retried.", 500, true);
  return completed;
}

export const prospectingJobCompletionHandlers = Object.freeze({
  collection: completeCollection,
  enrichment: completeEnrichment,
});

export function completeProspectingJob(
  db: ProspectingDb,
  job: ClaimedJob,
  run: ApifyActorRun,
): Promise<ProspectingJob> {
  return prospectingJobCompletionHandlers[job.job_type](db, job, run);
}
