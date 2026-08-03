import { ApifyClientError, getApifyActorRun, getApifyDatasetItems, startApifyActorRun } from "@/lib/prospecting/apify-client";
import { getProspectingAdapter, normalizeProspectingDataset } from "@/lib/prospecting/adapters";
import type { ProspectingCampaign, ProspectingJob } from "@/types/prospecting";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

export type ProspectingDb = SupabaseClient<Database>;

export class ProspectingJobError extends Error {
  constructor(message: string, public readonly status = 500, public readonly retryable = false) {
    super(message);
    this.name = "ProspectingJobError";
  }
}

function configuredNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(value, max)) : fallback;
}

function one<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function publicJobError(error: unknown): string {
  if (error instanceof ApifyClientError) return error.message;
  if (error instanceof ProspectingJobError) return error.message;
  return "Lead collection could not be completed. It can be retried safely.";
}

function boundedRaw(value: Record<string, unknown>): Record<string, unknown> {
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= 20_000) return value;
    return {
      truncated: true,
      originalCharacters: encoded.length,
      observedFields: Object.keys(value).sort(),
    };
  } catch {
    return { unavailable: true };
  }
}

async function checkpoint(
  db: ProspectingDb,
  jobId: string,
  leaseToken: string,
  values: {
    status: ProspectingJob["status"];
    providerStatus?: string | null;
    actorBuildId?: string | null;
    actorRunId?: string | null;
    actorDatasetId?: string | null;
    usageTotalUsd?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<ProspectingJob> {
  const { data, error } = await db.rpc("checkpoint_prospecting_job", {
    p_job_id: jobId,
    p_lease_token: leaseToken,
    p_status: values.status,
    p_provider_status: values.providerStatus ?? null,
    p_actor_build_id: values.actorBuildId ?? null,
    p_actor_run_id: values.actorRunId ?? null,
    p_actor_dataset_id: values.actorDatasetId ?? null,
    p_usage_total_usd: values.usageTotalUsd ?? null,
    p_error_code: values.errorCode ?? null,
    p_error_message: values.errorMessage ?? null,
  });
  const job = one(data as ProspectingJob[] | null);
  if (error || !job) throw new ProspectingJobError("The collection checkpoint could not be saved.", 500, true);
  return job;
}

async function claimJob(
  db: ProspectingDb,
  jobId: string,
  clientId: string,
): Promise<(ProspectingJob & { lease_token: string }) | null> {
  const { data, error } = await db.rpc("claim_prospecting_job", {
    p_job_id: jobId,
    p_client_id: clientId,
    p_lease_seconds: 120,
  });
  if (error) throw new ProspectingJobError("The collection job could not be claimed.", 500, true);
  return one(data as Array<ProspectingJob & { lease_token: string }> | null);
}

export async function startProspectingRun(
  db: ProspectingDb,
  campaign: ProspectingCampaign,
  actorId: string,
): Promise<ProspectingJob> {
  const adapter = getProspectingAdapter(campaign.source);
  const validation = adapter.validate({
    queries: campaign.queries,
    locations: campaign.locations,
    maxResults: campaign.max_results,
    countryCode: campaign.country_code,
    languageCode: campaign.language_code,
  });
  if (!validation.valid) throw new ProspectingJobError(validation.errors[0] ?? "Campaign is invalid.", 422);

  const maxCharge = configuredNumber("PROSPECTING_MAX_CHARGE_USD", 0.5, 0.5, 5);
  const { data, error } = await db.rpc("reserve_prospecting_job", {
    p_campaign_id: campaign.id,
    p_client_id: campaign.client_id,
    p_actor_id: actorId,
    p_actor_identifier: adapter.actorId,
    p_adapter_version: adapter.version,
    p_max_charge_usd: maxCharge,
    p_daily_run_limit: configuredNumber("PROSPECTING_DAILY_RUN_LIMIT", 10, 1, 100),
    p_daily_result_limit: configuredNumber("PROSPECTING_DAILY_RESULT_LIMIT", 500, 10, 10_000),
  });
  const reserved = one(data as ProspectingJob[] | null);
  if (error || !reserved) {
    const message = typeof error?.message === "string" && error.message.includes("budget")
      ? "Daily lead collection budget reached. Try again tomorrow."
      : typeof error?.message === "string" && error.message.includes("active run")
        ? "This campaign already has an active run."
        : "The lead collection job could not be created.";
    throw new ProspectingJobError(message, message.includes("already") ? 409 : 422);
  }

  const claimed = await claimJob(db, reserved.id, campaign.client_id);
  if (!claimed?.lease_token) throw new ProspectingJobError("The new collection job is busy. Try again.", 409, true);
  try {
    const run = await startApifyActorRun({
      actorId: adapter.actorId,
      input: adapter.buildInput({
        queries: campaign.queries,
        locations: campaign.locations,
        maxResults: campaign.max_results,
        countryCode: campaign.country_code,
        languageCode: campaign.language_code,
      }),
      maxItems: campaign.max_results,
      maxTotalChargeUsd: maxCharge,
      build: "latest",
    });
    return checkpoint(db, reserved.id, claimed.lease_token, {
      status: "running",
      providerStatus: run.status,
      actorBuildId: run.buildId,
      actorRunId: run.id,
      actorDatasetId: run.defaultDatasetId,
      usageTotalUsd: run.usageTotalUsd,
    });
  } catch (caught) {
    await checkpoint(db, reserved.id, claimed.lease_token, {
      status: "error",
      errorCode: caught instanceof ApifyClientError ? "provider_start_failed" : "start_failed",
      errorMessage: publicJobError(caught),
    }).catch(() => null);
    throw caught instanceof ApifyClientError
      ? new ProspectingJobError(caught.message, caught.status, caught.retryable)
      : new ProspectingJobError(publicJobError(caught), 500, true);
  }
}

export async function advanceProspectingJob(
  db: ProspectingDb,
  jobId: string,
  clientId: string,
): Promise<ProspectingJob | null> {
  const { data: existing, error: existingError } = await db
    .from("prospecting_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (existingError || !existing) throw new ProspectingJobError("Collection job not found.", 404);
  const current = existing as ProspectingJob;
  if (["done", "error", "cancelled"].includes(current.status)) return current;

  const claimed = await claimJob(db, jobId, clientId);
  if (!claimed?.lease_token) return null;
  if (!claimed.actor_run_id) {
    return checkpoint(db, jobId, claimed.lease_token, {
      status: "error",
      errorCode: "missing_provider_run",
      errorMessage: "The provider run was not recorded. Start a new campaign run.",
    });
  }

  try {
    const run = await getApifyActorRun(claimed.actor_run_id);
    if (["READY", "RUNNING", "ABORTING"].includes(run.status)) {
      return checkpoint(db, jobId, claimed.lease_token, {
        status: "running",
        providerStatus: run.status,
        actorBuildId: run.buildId,
        actorDatasetId: run.defaultDatasetId,
        usageTotalUsd: run.usageTotalUsd,
      });
    }
    if (run.status !== "SUCCEEDED") {
      return checkpoint(db, jobId, claimed.lease_token, {
        status: run.status === "ABORTED" ? "cancelled" : "error",
        providerStatus: run.status,
        actorBuildId: run.buildId,
        actorDatasetId: run.defaultDatasetId,
        usageTotalUsd: run.usageTotalUsd,
        errorCode: `provider_${run.status.toLowerCase()}`,
        errorMessage: "The lead provider did not complete this run. You can run the campaign again.",
      });
    }
    if (!run.defaultDatasetId) {
      return checkpoint(db, jobId, claimed.lease_token, {
        status: "error",
        providerStatus: run.status,
        errorCode: "missing_dataset",
        errorMessage: "The provider completed without a results dataset. Run the campaign again.",
      });
    }

    const { data: campaign, error: campaignError } = await db
      .from("prospecting_campaigns")
      .select("*")
      .eq("id", claimed.campaign_id)
      .eq("client_id", clientId)
      .single();
    if (campaignError || !campaign) throw new ProspectingJobError("Campaign not found.", 404);
    const datasetItems = await getApifyDatasetItems(run.defaultDatasetId, { limit: 100 });
    const results = normalizeProspectingDataset(
      claimed.source,
      datasetItems,
      {
        providerRunId: run.id,
        actorBuildId: run.buildId,
        capturedAt: new Date().toISOString(),
      },
      claimed.requested_results,
    ).map((row) => ({ ...row, raw: boundedRaw(row.raw) }));

    const { data, error } = await db.rpc("ingest_prospecting_job_results", {
      p_job_id: jobId,
      p_lease_token: claimed.lease_token,
      p_results: JSON.parse(JSON.stringify(results)) as Json,
      p_usage_total_usd: run.usageTotalUsd,
    });
    const completed = one(data as ProspectingJob[] | null);
    if (error || !completed) throw new ProspectingJobError("The collected leads could not be saved. The job can be retried.", 500, true);
    return completed;
  } catch (caught) {
    const retryable = caught instanceof ApifyClientError
      ? caught.retryable
      : caught instanceof ProspectingJobError
        ? caught.retryable
        : true;
    if (retryable) {
      return checkpoint(db, jobId, claimed.lease_token, {
        status: "running",
        errorCode: "temporary_advance_failure",
        errorMessage: publicJobError(caught),
      });
    }
    return checkpoint(db, jobId, claimed.lease_token, {
      status: "error",
      errorCode: "advance_failed",
      errorMessage: publicJobError(caught),
    });
  }
}
