import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProspectingCampaign, ProspectingJob } from "@/types/prospecting";

const startActor = jest.fn();
const getRun = jest.fn();
const getItems = jest.fn();
const abortRun = jest.fn();

jest.mock("@/lib/prospecting/apify-client", () => {
  class MockApifyClientError extends Error {
    constructor(
      message: string,
      public status: number,
      public retryable: boolean,
      public requestMayHaveStarted = false,
    ) {
      super(message);
    }
  }
  return {
    ApifyClientError: MockApifyClientError,
    startApifyActorRun: (...args: unknown[]) => startActor(...args),
    getApifyActorRun: (...args: unknown[]) => getRun(...args),
    getApifyDatasetItems: (...args: unknown[]) => getItems(...args),
    abortApifyActorRun: (...args: unknown[]) => abortRun(...args),
  };
});

import { advanceProspectingJob, startProspectingRun, type ProspectingDb } from "@/lib/prospecting/jobs";
import { ApifyClientError } from "@/lib/prospecting/apify-client";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/20260803000200_prospecting_phase1.sql"),
  "utf8",
);
const hardeningMigration = readFileSync(
  join(process.cwd(), "db/migrations/20260803000201_prospecting_phase1_hardening.sql"),
  "utf8",
);
const refundMigration = readFileSync(
  join(process.cwd(), "db/migrations/20260803000202_prospecting_usage_refund.sql"),
  "utf8",
);

const campaign: ProspectingCampaign = {
  id: "11111111-1111-4111-8111-111111111111",
  client_id: "22222222-2222-4222-8222-222222222222",
  name: "Mortgage brokers in Sydney",
  source: "google_maps",
  queries: ["mortgage broker"],
  locations: ["Sydney, Australia"],
  country_code: "au",
  language_code: "en",
  max_results: 1,
  ideal_profile: {},
  status: "ready",
  last_job_id: null,
  created_by: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-08-03T00:00:00.000Z",
  updated_at: "2026-08-03T00:00:00.000Z",
  archived_at: null,
};

const baseJob: ProspectingJob = {
  id: "44444444-4444-4444-8444-444444444444",
  campaign_id: campaign.id,
  client_id: campaign.client_id,
  source: "google_maps",
  job_type: "collection",
  lead_id: null,
  prospect_id: null,
  status: "queued",
  provider_status: null,
  actor_id: "compass~crawler-google-places",
  actor_provider_id: "nwua9Gu5YrADL7ZDj",
  actor_build_requested: "0.14.723",
  actor_build_id: null,
  actor_run_id: null,
  actor_dataset_id: null,
  input_payload: null,
  input_hash: null,
  adapter_version: 1,
  requested_results: 1,
  returned_results: 0,
  created_results: 0,
  deduplicated_results: 0,
  max_charge_usd: 0.5,
  usage_total_usd: null,
  usage_date: "2026-08-03",
  error_code: null,
  error_message: null,
  failure_count: 0,
  next_attempt_at: null,
  provider_confirmation_deadline: "2026-08-03T00:15:00.000Z",
  reservation_released_at: null,
  cancel_requested_at: null,
  created_at: "2026-08-03T00:00:00.000Z",
  updated_at: "2026-08-03T00:00:00.000Z",
  completed_at: null,
};

describe("prospecting Phase 1 database boundary", () => {
  test("keeps the domain separate and tenant-isolated", () => {
    for (const table of [
      "prospecting_campaigns",
      "prospecting_jobs",
      "prospecting_prospects",
      "prospecting_campaign_leads",
      "prospecting_usage",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`${table}'`);
    }
    expect(migration).not.toContain("CREATE POLICY prospecting_campaigns_tenant_write");
    expect(migration).toContain("FOR SELECT USING (client_id = current_user_client_id())");
  });

  test("enforces durable budgets, one active run, leases and serialized deduplication", () => {
    expect(migration).toContain("prospecting_jobs_one_active_campaign");
    expect(migration).toContain("Daily lead collection budget reached.");
    expect(migration).toContain("lease_until > clock_timestamp()");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("dedupe_keys && v_keys");
    expect(migration).toContain("ON CONFLICT (campaign_id, prospect_id) DO UPDATE");
    expect(hardeningMigration).toContain("canonical_key = v_row->>'canonicalKey'");
    expect(hardeningMigration).not.toContain("dedupe_keys && v_keys");
    expect(hardeningMigration).toContain("defer_prospecting_job");
    expect(hardeningMigration).toContain("retry_limit_reached");
    expect(hardeningMigration).toContain("request_prospecting_job_cancel");
    expect(hardeningMigration).toContain("reconcile_prospecting_provider_run");
    expect(refundMigration).toContain("reservation_released_at");
    expect(refundMigration).toContain("results_reserved = greatest(0, results_reserved - v_job.requested_results)");
  });

  test("allows only service role to execute orchestration and CRM promotion", () => {
    for (const fn of [
      "reserve_prospecting_job",
      "claim_prospecting_job",
      "checkpoint_prospecting_job",
      "ingest_prospecting_job_results",
      "promote_prospecting_lead_to_crm",
    ]) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated;`));
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([\\s\\S]*?TO service_role;`));
    }
    expect(migration).toContain("IF v_lead.crm_contact_id IS NOT NULL THEN RETURN v_lead.crm_contact_id");
    expect(migration).toContain("Actor does not belong to this client.");
    expect(hardeningMigration).toContain("prospecting_prospects_crm_contact_unique");
    expect(hardeningMigration).toContain("WHERE prospect_id = v_prospect.id AND client_id = p_client_id");
  });
});

describe("prospecting Phase 1 orchestration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("reserves and claims before starting a paid Actor", async () => {
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "reserve_prepare_claim_prospecting_job") return { data: [{ ...baseJob, lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      if (name === "checkpoint_prospecting_job") {
        return { data: [{ ...baseJob, status: args.p_status, actor_run_id: args.p_actor_run_id }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    startActor.mockResolvedValue({
      id: "apify-run-1",
      actId: "nwua9Gu5YrADL7ZDj",
      status: "READY",
      defaultDatasetId: "dataset-1",
      startedAt: null,
      finishedAt: null,
      buildId: "build-1",
      usageTotalUsd: null,
    });

    const job = await startProspectingRun({ rpc, from: jest.fn() } as unknown as ProspectingDb, campaign, campaign.created_by!);
    expect(job.status).toBe("running");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_prepare_claim_prospecting_job",
      "checkpoint_prospecting_job",
    ]);
    expect(startActor).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "compass~crawler-google-places",
      maxItems: 1,
      maxTotalChargeUsd: 0.5,
    }));
  });

  test("keeps an ambiguous paid start active for signed webhook reconciliation", async () => {
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "reserve_prepare_claim_prospecting_job") {
        return { data: [{ ...baseJob, lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "checkpoint_prospecting_job") {
        return { data: [{
          ...baseJob,
          status: args.p_status,
          error_code: args.p_error_code,
          error_message: args.p_error_message,
        }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    startActor.mockRejectedValue(new ApifyClientError("The lead provider timed out. Try again.", 504, true, true));

    const job = await startProspectingRun(
      { rpc, from: jest.fn() } as unknown as ProspectingDb,
      campaign,
      campaign.created_by!,
      { webhookUrlForJob: (jobId) => `https://portal.example/webhook?job=${jobId}` },
    );
    expect(job.status).toBe("running");
    expect(job.error_code).toBe("provider_start_unconfirmed");
    expect(startActor).toHaveBeenCalledWith(expect.objectContaining({
      webhookUrl: expect.stringContaining(baseJob.id),
    }));
  });

  test("releases reserved result quota after a definitive rejected provider start", async () => {
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "reserve_prepare_claim_prospecting_job") {
        return { data: [{ ...baseJob, lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "release_prospecting_job_reservation") {
        return { data: [{ ...baseJob, status: "error", reservation_released_at: "2026-08-03T00:01:00.000Z" }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    startActor.mockRejectedValue(new ApifyClientError("Provider busy", 429, true, false));

    await expect(startProspectingRun(
      { rpc, from: jest.fn() } as unknown as ProspectingDb,
      campaign,
      campaign.created_by!,
    )).rejects.toEqual(expect.objectContaining({ status: 429, retryable: true }));
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_prepare_claim_prospecting_job",
      "release_prospecting_job_reservation",
    ]);
  });

  test("stops and records an unexpected provider Actor without refunding or starting again", async () => {
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "reserve_prepare_claim_prospecting_job") {
        return { data: [{ ...baseJob, lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "checkpoint_prospecting_job") {
        return { data: [{ ...baseJob, status: args.p_status, actor_run_id: args.p_actor_run_id }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    startActor.mockResolvedValue({
      id: "unexpected-run", actId: "differentActor123", status: "READY",
      defaultDatasetId: "unexpected-data", startedAt: null, finishedAt: null,
      buildId: "unexpected-build", usageTotalUsd: 0.01,
    });
    abortRun.mockResolvedValue({ id: "unexpected-run", actId: "differentActor123", status: "ABORTING" });

    await expect(startProspectingRun(
      { rpc, from: jest.fn() } as unknown as ProspectingDb,
      campaign,
      campaign.created_by!,
    )).rejects.toEqual(expect.objectContaining({ status: 502, retryable: false }));
    expect(abortRun).toHaveBeenCalledWith("unexpected-run");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_prepare_claim_prospecting_job",
      "checkpoint_prospecting_job",
    ]);
  });

  test("normalizes, caps and atomically ingests a completed dataset", async () => {
    const runningJob = {
      ...baseJob,
      status: "running" as const,
      actor_run_id: "apify-run-1",
      actor_dataset_id: "dataset-1",
    };
    const jobQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: runningJob, error: null }),
    };
    const campaignQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: campaign, error: null }),
    };
    const from = jest.fn((table: string) => table === "prospecting_jobs" ? jobQuery : campaignQuery);
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_prospecting_job") {
        return { data: [{ ...runningJob, lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "ingest_prospecting_job_results_v2") {
        return { data: [{ ...runningJob, status: "done", returned_results: (args.p_results as unknown[]).length }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    getRun.mockResolvedValue({
      id: "apify-run-1",
      actId: "nwua9Gu5YrADL7ZDj",
      status: "SUCCEEDED",
      defaultDatasetId: "dataset-1",
      startedAt: null,
      finishedAt: null,
      buildId: "build-live-1",
      usageTotalUsd: 0.002,
    });
    getItems.mockResolvedValue([
      { title: "One Finance", placeId: "place-1", website: "https://one.example", url: "https://maps.example/one" },
      { title: "Two Finance", placeId: "place-2", website: "https://two.example", url: "https://maps.example/two" },
    ]);

    const job = await advanceProspectingJob({ rpc, from } as unknown as ProspectingDb, runningJob.id, campaign.client_id);
    expect(job?.status).toBe("done");
    const ingest = rpc.mock.calls.find(([name]) => name === "ingest_prospecting_job_results_v2");
    expect(ingest).toBeDefined();
    const args = ingest![1] as Record<string, unknown>;
    expect(args.p_results).toHaveLength(1);
    expect(args.p_results).toEqual([
      expect.objectContaining({
        companyName: "One Finance",
        dedupeKeys: expect.any(Array),
        source: expect.objectContaining({
          providerRunId: "apify-run-1",
          actorBuildId: "build-live-1",
          adapterVersion: 2,
        }),
      }),
    ]);
    expect(from).not.toHaveBeenCalledWith("crm_contacts");
  });

  test("aborts and checkpoints a user-cancelled provider run", async () => {
    const runningJob = {
      ...baseJob,
      status: "running" as const,
      actor_run_id: "apify-run-cancel",
      cancel_requested_at: "2026-08-03T00:01:00.000Z",
    };
    const jobQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: runningJob, error: null }),
    };
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_prospecting_job") {
        return { data: [{ ...runningJob, lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "checkpoint_prospecting_job") {
        return { data: [{ ...runningJob, status: args.p_status, provider_status: args.p_provider_status }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    getRun.mockResolvedValue({
      id: runningJob.actor_run_id,
      actId: "nwua9Gu5YrADL7ZDj",
      status: "RUNNING",
      defaultDatasetId: "dataset-1",
      startedAt: null,
      finishedAt: null,
      buildId: "build-1",
      usageTotalUsd: 0.001,
    });
    abortRun.mockResolvedValue({
      id: runningJob.actor_run_id,
      actId: "nwua9Gu5YrADL7ZDj",
      status: "ABORTING",
      defaultDatasetId: "dataset-1",
      startedAt: null,
      finishedAt: null,
      buildId: "build-1",
      usageTotalUsd: 0.001,
    });

    const job = await advanceProspectingJob(
      { rpc, from: jest.fn(() => jobQuery) } as unknown as ProspectingDb,
      runningJob.id,
      campaign.client_id,
    );
    expect(abortRun).toHaveBeenCalledWith(runningJob.actor_run_id);
    expect(job?.status).toBe("cancelled");
    expect(job?.provider_status).toBe("ABORTING");
  });

  test("sends transient polling failures through the bounded database retry policy", async () => {
    const runningJob = { ...baseJob, status: "running" as const, actor_run_id: "apify-run-retry" };
    const jobQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: runningJob, error: null }),
    };
    const rpc = jest.fn(async (name: string) => {
      if (name === "claim_prospecting_job") {
        return { data: [{ ...runningJob, lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "defer_prospecting_job") {
        return { data: [{ ...runningJob, failure_count: 1, next_attempt_at: "2026-08-03T00:02:00.000Z" }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    getRun.mockRejectedValue(new ApifyClientError("Provider unavailable", 502, true));

    const job = await advanceProspectingJob(
      { rpc, from: jest.fn(() => jobQuery) } as unknown as ProspectingDb,
      runningJob.id,
      campaign.client_id,
    );
    expect(job?.failure_count).toBe(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_prospecting_job",
      "defer_prospecting_job",
    ]);
  });
});

describe("prospecting API tenant checks", () => {
  test("every signed-in prospecting route checks client access", () => {
    const routes = [
      "app/api/prospecting/campaigns/route.ts",
      "app/api/prospecting/runs/route.ts",
      "app/api/prospecting/runs/advance/route.ts",
      "app/api/prospecting/runs/cancel/route.ts",
      "app/api/prospecting/leads/route.ts",
      "app/api/prospecting/enrich/route.ts",
      "app/api/prospecting/promote/route.ts",
      "app/api/prospecting/provider-status/route.ts",
    ];
    for (const route of routes) {
      const source = readFileSync(join(process.cwd(), route), "utf8");
      expect(source).toContain("withAuth(");
      expect(source).toContain("assertClientAccess(user");
    }
  });

  test("the UI explains review-first CRM promotion and background recovery", () => {
    const workspace = readFileSync(join(process.cwd(), "components/prospecting/LeadGenerationWorkspace.tsx"), "utf8");
    const search = readFileSync(join(process.cwd(), "components/prospecting/LeadSearchForm.tsx"), "utf8");
    const inbox = readFileSync(join(process.cwd(), "components/prospecting/LeadInbox.tsx"), "utf8");
    const campaigns = readFileSync(join(process.cwd(), "components/prospecting/CampaignManager.tsx"), "utf8");
    const activeJob = readFileSync(join(process.cwd(), "components/prospecting/ProspectingActiveJob.tsx"), "utf8");
    expect(search).toContain("Nothing is added to CRM automatically.");
    expect(activeJob).toContain("You can leave this page; RapidTal will keep working.");
    expect(inbox).toContain("Add to CRM");
    expect(inbox).toContain("aria-label=\"Previous lead page\"");
    expect(activeJob).toContain("Cancel");
    expect(campaigns).toContain("provider-reported spend");
    expect(search).toContain("Improve matching (optional)");
    expect(inbox).toContain("Why this score");
    expect(inbox).toContain("Enrich company");
  });
});
