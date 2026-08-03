import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import providers from "@/lib/prospecting/providers.json";
import { getProspectingAdapter, normalizeProspectingDataset } from "@/lib/prospecting/adapters";
import { getProspectingEnrichmentAdapter } from "@/lib/prospecting/enrichment";
import {
  abortApifyActorRun,
  ApifyClientError,
  getApifyActorRun,
  getApifyDatasetItems,
  startApifyActorRun,
} from "@/lib/prospecting/apify-client";
import type { ProspectingSource } from "@/lib/prospecting/types";

export const PROSPECTING_PROVIDER_IDS = [
  "google_maps", "google_search", "linkedin_profiles", "website_enrichment",
] as const;
export type ProspectingProviderId = typeof PROSPECTING_PROVIDER_IDS[number];
export type ProspectingProviderCheckStatus = "queued" | "running" | "passed" | "warning" | "failed";
export type ProspectingProviderCheck = {
  id: string;
  provider: ProspectingProviderId;
  status: ProspectingProviderCheckStatus;
  actor_id: string;
  actor_provider_id: string;
  actor_build_requested: string;
  actor_build_id: string | null;
  actor_run_id: string | null;
  actor_dataset_id: string | null;
  input_hash: string;
  requested_results: number;
  usable_results: number | null;
  latency_ms: number | null;
  usage_total_usd: number | null;
  provider_status: string | null;
  diagnostic: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export class ProviderHealthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ProviderHealthError";
  }
}

function testContract(provider: ProspectingProviderId): {
  actorId: string;
  providerActorId: string;
  build: string;
  input: Record<string, unknown>;
  maxItems: number;
} {
  if (provider === "website_enrichment") {
    const adapter = getProspectingEnrichmentAdapter(provider);
    return {
      actorId: adapter.actorId,
      providerActorId: adapter.providerActorId,
      build: adapter.build,
      input: adapter.buildInput("https://www.rapidtal.online/"),
      maxItems: adapter.maxItems,
    };
  }
  const adapter = getProspectingAdapter(provider as ProspectingSource);
  const criteria = provider === "linkedin_profiles"
    ? { queries: ["Founder"], locations: ["Sydney, Australia"], maxResults: 1, countryCode: "au", languageCode: "en", jobTitles: ["Founder"] }
    : { queries: ["accountant"], locations: ["Sydney, Australia"], maxResults: 1, countryCode: "au", languageCode: "en" };
  return {
    actorId: adapter.actorId,
    providerActorId: adapter.providerActorId,
    build: adapter.build,
    input: adapter.buildInput(criteria),
    maxItems: 1,
  };
}

function publicDiagnostic(error: unknown): string {
  if (error instanceof ApifyClientError) return error.message;
  return "The scraper check could not be completed. Try it again.";
}

function elapsed(startedAt: string): number {
  return Math.max(0, Date.now() - new Date(startedAt).getTime());
}

export async function startProspectingProviderCheck(
  provider: ProspectingProviderId,
  initiatedBy: string | null,
): Promise<ProspectingProviderCheck> {
  const db = createAdminClient();
  const table = db.from("prospecting_provider_checks");
  const contract = testContract(provider);
  const row = {
    provider,
    status: "queued" as const,
    actor_id: contract.actorId,
    actor_provider_id: contract.providerActorId,
    actor_build_requested: contract.build,
    input_hash: createHash("sha256").update(JSON.stringify(contract.input)).digest("hex"),
    requested_results: Math.min(contract.maxItems, 5),
    initiated_by: initiatedBy,
  };
  const { data: check, error: insertError } = await table.insert(row).select("*").single();
  if (insertError || !check) {
    if (insertError?.code === "23505") throw new ProviderHealthError("This scraper already has a test in progress.", 409);
    throw new ProviderHealthError("The scraper check could not be saved.", 500);
  }
  try {
    const run = await startApifyActorRun({
      actorId: contract.actorId,
      input: contract.input,
      // Health checks prove the contract with a small paid sample. Production
      // enrichment can still inspect the wider candidate pool before choosing
      // its five best pages.
      maxItems: Math.min(contract.maxItems, 5),
      maxTotalChargeUsd: 0.5,
      build: contract.build,
    });
    if (run.actId !== contract.providerActorId) {
      await abortApifyActorRun(run.id).catch(() => null);
      throw new Error("Unexpected provider Actor.");
    }
    const { data: updated, error: updateError } = await table.update({
      status: "running", actor_run_id: run.id, actor_dataset_id: run.defaultDatasetId,
      actor_build_id: run.buildId, provider_status: run.status,
    }).eq("id", check.id).select("*").single();
    if (updateError || !updated) throw new ProviderHealthError("The scraper run started but its check could not be saved.", 500);
    return updated as ProspectingProviderCheck;
  } catch (error) {
    const diagnostic = publicDiagnostic(error);
    const { data: failed } = await table.update({
      status: "failed", diagnostic, completed_at: new Date().toISOString(),
      latency_ms: elapsed(check.started_at),
    }).eq("id", check.id).select("*").single();
    return (failed ?? { ...check, status: "failed", diagnostic }) as ProspectingProviderCheck;
  }
}

export async function advanceProspectingProviderCheck(
  provider: ProspectingProviderId,
  checkId: string,
): Promise<ProspectingProviderCheck> {
  const db = createAdminClient();
  const table = db.from("prospecting_provider_checks");
  const { data: check, error: loadError } = await table.select("*")
    .eq("id", checkId).eq("provider", provider).maybeSingle();
  if (loadError) throw new ProviderHealthError("The scraper check could not be loaded.", 500);
  if (!check) throw new ProviderHealthError("Scraper check not found.", 404);
  if (!["queued", "running"].includes(check.status)) return check as ProspectingProviderCheck;
  if (!check.actor_run_id) {
    const { data: failed, error: updateError } = await table.update({
      status: "failed", diagnostic: "The scraper check did not start correctly.",
      completed_at: new Date().toISOString(), latency_ms: elapsed(check.started_at),
    }).eq("id", check.id).select("*").single();
    if (updateError || !failed) throw new ProviderHealthError("The incomplete check could not be recovered.", 500);
    return failed as ProspectingProviderCheck;
  }

  try {
    const run = await getApifyActorRun(check.actor_run_id);
    if (run.actId !== check.actor_provider_id) throw new Error("Unexpected provider Actor.");
    if (["READY", "RUNNING", "ABORTING", "TIMING-OUT"].includes(run.status)) {
      const { data: running, error: runningError } = await table.update({
        status: "running", provider_status: run.status, actor_dataset_id: run.defaultDatasetId,
        actor_build_id: run.buildId,
      }).eq("id", check.id).select("*").single();
      if (runningError || !running) throw new ProviderHealthError("The running check could not be updated.", 500);
      return running as ProspectingProviderCheck;
    }
    if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) {
      const diagnostic = `Apify finished with ${run.status.toLowerCase().replaceAll("-", " ")}.`;
      const { data: failed, error: updateError } = await table.update({
        status: "failed", provider_status: run.status, diagnostic,
        actor_build_id: run.buildId, actor_dataset_id: run.defaultDatasetId,
        usage_total_usd: run.usageTotalUsd, completed_at: new Date().toISOString(),
        latency_ms: elapsed(check.started_at),
      }).eq("id", check.id).select("*").single();
      if (updateError || !failed) throw new ProviderHealthError("The failed check could not be recorded.", 500);
      return failed as ProspectingProviderCheck;
    }

    const values = await getApifyDatasetItems(run.defaultDatasetId, { limit: 5 });
    let usable = 0;
    if (provider === "website_enrichment") {
      try {
        usable = getProspectingEnrichmentAdapter(provider).normalize("https://www.rapidtal.online/", values).pageCount;
      } catch {
        usable = 0;
      }
    } else {
      usable = normalizeProspectingDataset(
        provider as ProspectingSource, values,
        { providerRunId: run.id, actorBuildId: run.buildId, capturedAt: new Date().toISOString() }, 5,
      ).length;
    }
    // A successful Actor process is not a successful product contract. The
    // light is only green when RapidTal can normalize at least one usable
    // record; zero usable results must be actionable red, not ambiguous amber.
    const status = usable > 0 ? "passed" : "failed";
    const diagnostic = usable > 0
      ? `${usable} usable ${usable === 1 ? "result" : "results"} passed normalisation.`
      : "The Actor ran successfully but returned no usable normalised results.";
    const { data: completed, error: updateError } = await table.update({
      status, usable_results: usable, provider_status: run.status, diagnostic,
      actor_build_id: run.buildId, actor_dataset_id: run.defaultDatasetId,
      usage_total_usd: run.usageTotalUsd, completed_at: new Date().toISOString(),
      latency_ms: elapsed(check.started_at),
    }).eq("id", check.id).select("*").single();
    if (updateError || !completed) throw new ProviderHealthError("The completed check could not be recorded.", 500);
    return completed as ProspectingProviderCheck;
  } catch (error) {
    if (error instanceof ProviderHealthError) throw error;
    const diagnostic = publicDiagnostic(error);
    const { data: failed, error: updateError } = await table.update({
      status: "failed", diagnostic, completed_at: new Date().toISOString(),
      latency_ms: elapsed(check.started_at),
    }).eq("id", check.id).select("*").single();
    if (updateError || !failed) throw new ProviderHealthError("The failed check could not be recorded.", 500);
    return failed as ProspectingProviderCheck;
  }
}

export function providerCatalogue() {
  return providers;
}
