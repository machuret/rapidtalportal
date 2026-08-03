import { abortApifyActorRun, ApifyClientError, getApifyActorRun } from "@/lib/prospecting/apify-client";
import { completeProspectingJob } from "@/lib/prospecting/job-completion-handlers";
import { ProspectingJobError } from "@/lib/prospecting/job-errors";
import {
  assertExpectedActor,
  checkpointJob,
  claimJob,
  deferJob,
  one,
  publicJobError,
  releaseCollectionReservation,
  releaseEnrichmentReservation,
  type ClaimedProspectingJob,
  type ProspectingDb,
} from "@/lib/prospecting/job-runtime";
import type { ProspectingJob } from "@/types/prospecting";

type JobLifecyclePolicy = {
  providerFailure: string;
  missingDataset: string;
  confirmationExpired: string;
};

export const prospectingJobLifecyclePolicies: Readonly<Record<ProspectingJob["job_type"], JobLifecyclePolicy>> = Object.freeze({
  collection: {
    providerFailure: "The lead provider did not complete this run. You can run the campaign again.",
    missingDataset: "The provider completed without a results dataset. Run the campaign again.",
    confirmationExpired: "The provider did not confirm this collection. Run the campaign again.",
  },
  enrichment: {
    providerFailure: "The provider did not complete company enrichment. Try enriching this lead again.",
    missingDataset: "Company enrichment completed without readable results. Try enriching this lead again.",
    confirmationExpired: "The provider did not confirm company enrichment. No daily allowance was used.",
  },
});

async function resolveUnconfirmedStart(
  db: ProspectingDb,
  job: ClaimedProspectingJob,
): Promise<ProspectingJob> {
  const policy = prospectingJobLifecyclePolicies[job.job_type];
  const deadline = job.provider_confirmation_deadline
    ? new Date(job.provider_confirmation_deadline).getTime()
    : new Date(job.created_at).getTime() + 15 * 60_000;
  if (Date.now() < deadline) {
    return deferJob(
      db, job.id, job.lease_token,
      job.cancel_requested_at ? "cancel_waiting_for_provider" : "provider_start_unconfirmed",
      job.cancel_requested_at
        ? "Cancellation is waiting for the provider run identifier."
        : "Waiting for the lead provider to confirm that collection started.",
      false,
    );
  }
  if (job.job_type === "enrichment") {
    return releaseEnrichmentReservation(
      db, job.id, job.client_id,
      job.cancel_requested_at ? "cancelled_before_start" : "provider_confirmation_expired",
      job.cancel_requested_at
        ? "Company enrichment was cancelled before it started. No daily allowance was used."
        : policy.confirmationExpired,
    );
  }
  const expired = await checkpointJob(db, job.id, job.lease_token, {
    status: job.cancel_requested_at ? "cancelled" : "error",
    errorCode: job.cancel_requested_at ? null : "provider_confirmation_expired",
    errorMessage: job.cancel_requested_at ? null : policy.confirmationExpired,
  });
  return job.cancel_requested_at
    ? expired
    : releaseCollectionReservation(db, job.id, job.client_id).catch(() => expired);
}

async function cancelProviderRun(
  db: ProspectingDb,
  job: ClaimedProspectingJob,
): Promise<ProspectingJob> {
  const currentRun = await getApifyActorRun(job.actor_run_id!);
  assertExpectedActor(currentRun, job.actor_provider_id ?? "");
  const stopped = ["READY", "RUNNING", "ABORTING"].includes(currentRun.status)
    ? await abortApifyActorRun(job.actor_run_id!)
    : currentRun;
  return checkpointJob(db, job.id, job.lease_token, {
    status: "cancelled", providerStatus: stopped.status, actorBuildId: stopped.buildId,
    actorDatasetId: stopped.defaultDatasetId, usageTotalUsd: stopped.usageTotalUsd,
  });
}

export async function advanceProspectingJob(
  db: ProspectingDb,
  jobId: string,
  clientId: string,
): Promise<ProspectingJob | null> {
  const { data: existing, error } = await db.from("prospecting_jobs")
    .select("*").eq("id", jobId).eq("client_id", clientId).maybeSingle();
  if (error || !existing) throw new ProspectingJobError("Collection job not found.", 404);
  const current = existing as ProspectingJob;
  if (["done", "error", "cancelled"].includes(current.status)) return current;

  const claimed = await claimJob(db, jobId, clientId);
  if (!claimed?.lease_token) return null;
  if (!claimed.actor_run_id) return resolveUnconfirmedStart(db, claimed);

  try {
    if (claimed.cancel_requested_at) return cancelProviderRun(db, claimed);
    const run = await getApifyActorRun(claimed.actor_run_id);
    assertExpectedActor(run, claimed.actor_provider_id ?? "");
    if (["READY", "RUNNING", "ABORTING"].includes(run.status)) {
      return checkpointJob(db, jobId, claimed.lease_token, {
        status: "running", providerStatus: run.status, actorBuildId: run.buildId,
        actorDatasetId: run.defaultDatasetId, usageTotalUsd: run.usageTotalUsd,
      });
    }
    const policy = prospectingJobLifecyclePolicies[claimed.job_type];
    if (run.status !== "SUCCEEDED") {
      return checkpointJob(db, jobId, claimed.lease_token, {
        status: run.status === "ABORTED" ? "cancelled" : "error",
        providerStatus: run.status, actorBuildId: run.buildId,
        actorDatasetId: run.defaultDatasetId, usageTotalUsd: run.usageTotalUsd,
        errorCode: `provider_${run.status.toLowerCase()}`,
        errorMessage: policy.providerFailure,
      });
    }
    if (!run.defaultDatasetId) {
      return checkpointJob(db, jobId, claimed.lease_token, {
        status: "error", providerStatus: run.status,
        errorCode: "missing_dataset", errorMessage: policy.missingDataset,
      });
    }
    return completeProspectingJob(db, claimed, run);
  } catch (caught) {
    const retryable = caught instanceof ApifyClientError
      ? caught.retryable
      : caught instanceof ProspectingJobError ? caught.retryable : true;
    if (retryable) {
      return deferJob(db, jobId, claimed.lease_token, "temporary_advance_failure", publicJobError(caught));
    }
    return checkpointJob(db, jobId, claimed.lease_token, {
      status: "error", errorCode: "advance_failed", errorMessage: publicJobError(caught),
    });
  }
}

export async function requestProspectingCancellation(
  db: ProspectingDb,
  jobId: string,
  clientId: string,
  actorId: string,
): Promise<ProspectingJob> {
  const { data, error } = await db.rpc("request_prospecting_job_cancel", {
    p_job_id: jobId, p_client_id: clientId, p_actor_id: actorId,
  });
  const job = one(data as ProspectingJob[] | null);
  if (error || !job) throw new ProspectingJobError("The collection could not be cancelled.", 500, true);
  if (["done", "error", "cancelled"].includes(job.status)) return job;
  return (await advanceProspectingJob(db, job.id, clientId)) ?? job;
}
