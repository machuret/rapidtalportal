import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApifyClientError } from "@/lib/prospecting/apify-client";
import { ProspectingJobError } from "@/lib/prospecting/job-errors";
import type { ApifyActorRun } from "@/lib/prospecting/types";
import type { Database, Json } from "@/types/database";
import type { ProspectingJob } from "@/types/prospecting";

export type ProspectingDb = SupabaseClient<Database>;
export type ClaimedProspectingJob = ProspectingJob & { lease_token: string };

export function configuredNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(value, max)) : fallback;
}

export function configuredInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.max(min, Math.min(value, max)) : fallback;
}

export function one<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function publicJobError(error: unknown): string {
  if (error instanceof ApifyClientError) return error.message;
  if (error instanceof ProspectingJobError) return error.message;
  return "Lead collection could not be completed. It can be retried safely.";
}

export function inputContract(input: Record<string, unknown>): { payload: Json; hash: string } {
  const encoded = JSON.stringify(input);
  if (encoded.length > 131_072) {
    throw new ProspectingJobError("The provider input is too large to run safely.", 422);
  }
  return {
    payload: JSON.parse(encoded) as Json,
    hash: createHash("sha256").update(encoded).digest("hex"),
  };
}

export function assertExpectedActor(run: ApifyActorRun, expectedActorId: string): void {
  if (run.actId !== expectedActorId) {
    throw new ProspectingJobError("The provider returned a run from an unexpected scraper.", 502, false);
  }
}

export async function checkpointJob(
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

export async function claimJob(
  db: ProspectingDb,
  jobId: string,
  clientId: string,
): Promise<ClaimedProspectingJob | null> {
  const { data, error } = await db.rpc("claim_prospecting_job", {
    p_job_id: jobId,
    p_client_id: clientId,
    p_lease_seconds: 120,
  });
  if (error) throw new ProspectingJobError("The collection job could not be claimed.", 500, true);
  return one(data as unknown as ClaimedProspectingJob[] | null);
}

export async function deferJob(
  db: ProspectingDb,
  jobId: string,
  leaseToken: string,
  errorCode: string,
  errorMessage: string,
  countFailure = true,
): Promise<ProspectingJob> {
  const { data, error } = await db.rpc("defer_prospecting_job", {
    p_job_id: jobId,
    p_lease_token: leaseToken,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_count_failure: countFailure,
    p_max_failures: 5,
  });
  const job = one(data as ProspectingJob[] | null);
  if (error || !job) throw new ProspectingJobError("The collection retry could not be scheduled.", 500, true);
  return job;
}

export async function releaseCollectionReservation(
  db: ProspectingDb,
  jobId: string,
  clientId: string,
): Promise<ProspectingJob> {
  const { data, error } = await db.rpc("release_prospecting_job_reservation", {
    p_job_id: jobId,
    p_client_id: clientId,
  });
  const job = one(data as ProspectingJob[] | null);
  if (error || !job) throw new ProspectingJobError("The unused collection quota could not be released.", 500, true);
  return job;
}

export async function releaseEnrichmentReservation(
  db: ProspectingDb,
  jobId: string,
  clientId: string,
  errorCode: string,
  errorMessage: string,
): Promise<ProspectingJob> {
  const { data, error } = await db.rpc("release_prospecting_enrichment_reservation", {
    p_job_id: jobId,
    p_client_id: clientId,
    p_error_code: errorCode,
    p_error_message: errorMessage,
  });
  const job = one(data as ProspectingJob[] | null);
  if (error || !job) throw new ProspectingJobError("The unused enrichment allowance could not be released.", 500, true);
  return job;
}
