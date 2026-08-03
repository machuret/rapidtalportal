import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProspectingJob } from "@/types/prospecting";

const startActor = jest.fn();

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
    getApifyActorRun: jest.fn(),
    getApifyDatasetItems: jest.fn(),
    abortApifyActorRun: jest.fn(),
  };
});

import { startProspectingEnrichment, type ProspectingDb } from "@/lib/prospecting/jobs";
import { ApifyClientError } from "@/lib/prospecting/apify-client";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/20260803000303_prospecting_phase2_audit_fixes.sql"),
  "utf8",
);
const collectionTimezoneMigration = readFileSync(
  join(process.cwd(), "db/migrations/20260803000304_prospecting_collection_timezone.sql"),
  "utf8",
);

const enrichmentJob: ProspectingJob = {
  id: "44444444-4444-4444-8444-444444444444",
  campaign_id: "11111111-1111-4111-8111-111111111111",
  client_id: "22222222-2222-4222-8222-222222222222",
  source: "website_enrichment",
  job_type: "enrichment",
  lead_id: "66666666-6666-4666-8666-666666666666",
  prospect_id: "77777777-7777-4777-8777-777777777777",
  status: "queued",
  provider_status: null,
  actor_id: "apify/website-content-crawler",
  actor_provider_id: "aYG0l9s7dbB7j3gbS",
  actor_build_requested: "0.3.93",
  actor_build_id: null,
  actor_run_id: null,
  actor_dataset_id: null,
  input_payload: null,
  input_hash: null,
  adapter_version: 1,
  requested_results: 5,
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

describe("Lead Generation Phase 2 audit hardening", () => {
  beforeEach(() => jest.clearAllMocks());

  test("enforces declared minimums and exposes the exact matching evidence", () => {
    expect(migration).toContain("IF NOT v_rating_pass OR NOT v_reviews_pass THEN v_score := least(v_score, 49)");
    expect(migration).toContain("'requiredMissing', to_jsonb(v_required_missing)");
    expect(migration).toContain("'excludedMatched', to_jsonb(v_excluded_matched)");
    expect(migration).toContain("score_version = 'prospecting-fit-v2'");
  });

  test("uses the Sydney business date and rejects ineligible enrichment", () => {
    expect(migration).toContain("AT TIME ZONE 'Australia/Sydney'");
    expect(collectionTimezoneMigration).toContain("AT TIME ZONE 'Australia/Sydney'");
    expect(collectionTimezoneMigration).toContain("max_charge_usd, usage_date, created_by");
    expect(migration).toContain("v_lead.status NOT IN ('new', 'shortlisted')");
  });

  test("keeps scraped contact details out of canonical prospect fields", () => {
    const completion = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION complete_prospecting_enrichment"),
      migration.indexOf("CREATE OR REPLACE FUNCTION update_prospecting_campaign_profile"),
    );
    expect(completion).not.toContain("email = COALESCE");
    expect(completion).not.toContain("phone = COALESCE");
    expect(migration).toContain("Selected email is not part of this lead evidence.");
  });

  test("refunds daily allowance after a definitive provider-start failure", async () => {
    const rpc = jest.fn(async (name: string) => {
      if (name === "reserve_prepare_claim_prospecting_enrichment") {
        return { data: [{ ...enrichmentJob, status: "running", lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "release_prospecting_enrichment_reservation") {
        return { data: [{ ...enrichmentJob, status: "error", reservation_released_at: "2026-08-03T00:01:00.000Z" }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    startActor.mockRejectedValue(new ApifyClientError("Provider rejected the start", 502, true, false));

    await expect(startProspectingEnrichment(
      { rpc, from: jest.fn() } as unknown as ProspectingDb,
      {
        id: enrichmentJob.lead_id!,
        client_id: enrichmentJob.client_id,
        prospect: { website_url: "https://example.com" },
      },
      "33333333-3333-4333-8333-333333333333",
    )).rejects.toEqual(expect.objectContaining({ status: 502 }));

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_prepare_claim_prospecting_enrichment",
      "release_prospecting_enrichment_reservation",
    ]);
  });

  test("does not refund an ambiguous start that may have reached the provider", async () => {
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "reserve_prepare_claim_prospecting_enrichment") {
        return { data: [{ ...enrichmentJob, status: "running", lease_token: "55555555-5555-4555-8555-555555555555" }], error: null };
      }
      if (name === "checkpoint_prospecting_job") {
        return { data: [{ ...enrichmentJob, status: args.p_status, error_code: args.p_error_code }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    startActor.mockRejectedValue(new ApifyClientError("Provider timed out", 504, true, true));

    const result = await startProspectingEnrichment(
      { rpc, from: jest.fn() } as unknown as ProspectingDb,
      {
        id: enrichmentJob.lead_id!,
        client_id: enrichmentJob.client_id,
        prospect: { website_url: "https://example.com" },
      },
      "33333333-3333-4333-8333-333333333333",
    );

    expect(result.status).toBe("running");
    expect(rpc.mock.calls.map(([name]) => name).includes("release_prospecting_enrichment_reservation")).toBe(false);
  });
});
