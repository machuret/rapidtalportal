import { abortApifyActorRun, ApifyClientError, startApifyActorRun } from "@/lib/prospecting/apify-client";
import { getProspectingAdapter } from "@/lib/prospecting/adapters";
import { getProspectingEnrichmentAdapter } from "@/lib/prospecting/enrichment";
import { ProspectingJobError } from "@/lib/prospecting/job-errors";
import {
  checkpointJob,
  configuredInteger,
  configuredNumber,
  inputContract,
  one,
  publicJobError,
  releaseCollectionReservation,
  releaseEnrichmentReservation,
  type ClaimedProspectingJob,
  type ProspectingDb,
} from "@/lib/prospecting/job-runtime";
import type { ProspectingCampaign, ProspectingJob } from "@/types/prospecting";

export interface StartProspectingRunOptions {
  webhookUrlForJob?: (jobId: string) => string;
}

function pendingCheckpoint(job: ClaimedProspectingJob, run: {
  status: string;
  buildId: string | null;
  id: string;
  defaultDatasetId: string | null;
  usageTotalUsd: number | null;
}): ProspectingJob {
  return {
    ...job,
    status: "running",
    provider_status: run.status,
    actor_build_id: run.buildId,
    actor_run_id: run.id,
    actor_dataset_id: run.defaultDatasetId,
    usage_total_usd: run.usageTotalUsd,
    error_code: "checkpoint_confirmation_pending",
    error_message: "The provider run started and is awaiting database confirmation.",
  };
}

async function rejectUnexpectedActor(
  db: ProspectingDb,
  job: ClaimedProspectingJob,
  run: Awaited<ReturnType<typeof startApifyActorRun>>,
): Promise<never> {
  await abortApifyActorRun(run.id).catch(() => null);
  await checkpointJob(db, job.id, job.lease_token, {
    status: "error", providerStatus: run.status, actorBuildId: run.buildId,
    actorRunId: run.id, actorDatasetId: run.defaultDatasetId, usageTotalUsd: run.usageTotalUsd,
    errorCode: "unexpected_provider_actor",
    errorMessage: "The provider started an unexpected scraper. The run was stopped and no duplicate was started.",
  }).catch(() => null);
  throw new ProspectingJobError("The provider started an unexpected scraper.", 502, false);
}

function providerRunMayExist(error: unknown): boolean {
  return error instanceof ApifyClientError && error.requestMayHaveStarted
    || error instanceof ProspectingJobError && error.message.includes("unexpected scraper");
}

function rethrowStartError(error: unknown): never {
  if (error instanceof ProspectingJobError) throw error;
  if (error instanceof ApifyClientError) {
    throw new ProspectingJobError(error.message, error.status, error.retryable);
  }
  throw new ProspectingJobError(publicJobError(error), 500, true);
}

export async function startProspectingEnrichment(
  db: ProspectingDb,
  lead: { id: string; client_id: string; prospect: { website_url: string | null } },
  actorId: string,
  options: StartProspectingRunOptions = {},
): Promise<ProspectingJob> {
  if (!lead.prospect.website_url) throw new ProspectingJobError("This lead has no website to enrich.", 422);
  const adapter = getProspectingEnrichmentAdapter("website_enrichment");
  const providerInput = adapter.buildInput(lead.prospect.website_url);
  const contract = inputContract(providerInput);
  const maxCharge = configuredNumber("PROSPECTING_ENRICHMENT_MAX_CHARGE_USD", 0.5, 0.5, 3);
  const { data, error } = await db.rpc("reserve_prepare_claim_prospecting_enrichment", {
    p_lead_id: lead.id,
    p_client_id: lead.client_id,
    p_actor_id: actorId,
    p_actor_identifier: adapter.actorId,
    p_actor_provider_id: adapter.providerActorId,
    p_actor_build_requested: adapter.build,
    p_adapter_version: adapter.version,
    p_input_payload: contract.payload,
    p_input_hash: contract.hash,
    p_max_charge_usd: maxCharge,
    p_daily_enrichment_limit: configuredInteger("PROSPECTING_DAILY_ENRICHMENT_LIMIT", 50, 1, 500),
  });
  const claimed = one(data as unknown as ClaimedProspectingJob[] | null);
  if (error || !claimed?.lease_token) {
    const detail = typeof error?.message === "string" ? error.message : "";
    const message = detail.includes("active enrichment")
      ? "This lead is already being enriched."
      : detail.includes("budget")
        ? "Daily company-enrichment budget reached. Try again tomorrow."
        : detail.includes("no website")
          ? "This lead has no website to enrich."
          : "Company enrichment could not be started.";
    throw new ProspectingJobError(message, message.includes("already") ? 409 : 422);
  }
  try {
    const run = await startApifyActorRun({
      actorId: adapter.actorId,
      input: providerInput,
      maxItems: adapter.maxItems,
      maxTotalChargeUsd: maxCharge,
      build: adapter.build,
      webhookUrl: options.webhookUrlForJob?.(claimed.id),
      webhookIdempotencyKey: claimed.id,
    });
    if (run.actId !== adapter.providerActorId) return rejectUnexpectedActor(db, claimed, run);
    try {
      return await checkpointJob(db, claimed.id, claimed.lease_token, {
        status: "running", providerStatus: run.status, actorBuildId: run.buildId,
        actorRunId: run.id, actorDatasetId: run.defaultDatasetId, usageTotalUsd: run.usageTotalUsd,
      });
    } catch {
      return pendingCheckpoint(claimed, run);
    }
  } catch (caught) {
    if (caught instanceof ApifyClientError && caught.retryable && caught.requestMayHaveStarted) {
      return checkpointJob(db, claimed.id, claimed.lease_token, {
        status: "running", errorCode: "provider_start_unconfirmed",
        errorMessage: "Waiting for the enrichment provider to confirm that collection started.",
      });
    }
    if (!providerRunMayExist(caught)) {
      await releaseEnrichmentReservation(
        db, claimed.id, lead.client_id,
        caught instanceof ApifyClientError ? "provider_start_failed" : "start_failed",
        `${publicJobError(caught)} No daily enrichment allowance was used.`,
      ).catch(() => null);
    }
    return rethrowStartError(caught);
  }
}

export async function startProspectingRun(
  db: ProspectingDb,
  campaign: ProspectingCampaign,
  actorId: string,
  options: StartProspectingRunOptions = {},
): Promise<ProspectingJob> {
  const adapter = getProspectingAdapter(campaign.source);
  const criteria = {
    queries: campaign.queries,
    locations: campaign.locations,
    maxResults: campaign.max_results,
    countryCode: campaign.country_code,
    languageCode: campaign.language_code,
  };
  const validation = adapter.validate(criteria);
  if (!validation.valid) throw new ProspectingJobError(validation.errors[0] ?? "Campaign is invalid.", 422);
  const providerInput = adapter.buildInput(criteria);
  const contract = inputContract(providerInput);
  const maxCharge = configuredNumber("PROSPECTING_MAX_CHARGE_USD", 0.5, 0.5, 5);
  const { data, error } = await db.rpc("reserve_prepare_claim_prospecting_job", {
    p_campaign_id: campaign.id,
    p_client_id: campaign.client_id,
    p_actor_id: actorId,
    p_actor_identifier: adapter.actorId,
    p_actor_provider_id: adapter.providerActorId,
    p_actor_build_requested: adapter.build,
    p_adapter_version: adapter.version,
    p_input_payload: contract.payload,
    p_input_hash: contract.hash,
    p_max_charge_usd: maxCharge,
    p_daily_run_limit: configuredInteger("PROSPECTING_DAILY_RUN_LIMIT", 10, 1, 100),
    p_daily_result_limit: configuredInteger("PROSPECTING_DAILY_RESULT_LIMIT", 500, 10, 10_000),
  });
  const claimed = one(data as unknown as ClaimedProspectingJob[] | null);
  if (error || !claimed?.lease_token) {
    const message = typeof error?.message === "string" && error.message.includes("budget")
      ? "Daily lead collection budget reached. Try again tomorrow."
      : typeof error?.message === "string" && error.message.includes("active run")
        ? "This campaign already has an active run."
        : "The lead collection job could not be created.";
    throw new ProspectingJobError(message, message.includes("already") ? 409 : 422);
  }
  try {
    const run = await startApifyActorRun({
      actorId: adapter.actorId,
      input: providerInput,
      maxItems: campaign.max_results,
      maxTotalChargeUsd: maxCharge,
      build: adapter.build,
      webhookUrl: options.webhookUrlForJob?.(claimed.id),
      webhookIdempotencyKey: claimed.id,
    });
    if (run.actId !== adapter.providerActorId) return rejectUnexpectedActor(db, claimed, run);
    try {
      return await checkpointJob(db, claimed.id, claimed.lease_token, {
        status: "running", providerStatus: run.status, actorBuildId: run.buildId,
        actorRunId: run.id, actorDatasetId: run.defaultDatasetId, usageTotalUsd: run.usageTotalUsd,
      });
    } catch {
      return pendingCheckpoint(claimed, run);
    }
  } catch (caught) {
    if (caught instanceof ApifyClientError && caught.retryable && caught.requestMayHaveStarted) {
      return checkpointJob(db, claimed.id, claimed.lease_token, {
        status: "running", errorCode: "provider_start_unconfirmed",
        errorMessage: "Waiting for the lead provider to confirm that collection started.",
      });
    }
    if (!providerRunMayExist(caught)) {
      await releaseCollectionReservation(db, claimed.id, campaign.client_id).catch(() => null);
    }
    return rethrowStartError(caught);
  }
}
