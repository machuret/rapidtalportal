/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET as checkIns } from "@/app/api/cron/coach-check-ins/route";

const SECRET = "test-cron-secret";

const claimedItem = {
  id: "55555555-5555-4555-8555-555555555555",
  check_in_claim_token: "66666666-6666-4666-8666-666666666666",
  owner_id: "22222222-2222-4222-8222-222222222222",
  commitment: "Send the weekly report before Friday",
  status: "open",
  due_date: "2026-08-07",
  reminder_count: 0,
  goal_id: null,
};

function mockAdmin() {
  const rpc = jest.fn((name: string) => {
    if (name === "claim_due_coach_check_ins") {
      return Promise.resolve({ data: [claimedItem], error: null });
    }
    if (name === "deliver_coach_check_in") {
      return Promise.resolve({ data: true, error: null });
    }
    if (name === "complete_coach_check_in") {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  const from = jest.fn(() => {
    const chain: Record<string, jest.Mock> & { then?: PromiseLike<unknown>["then"] } = {};
    for (const m of ["select", "eq", "order", "limit"]) chain[m] = jest.fn(() => chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.upsert = jest.fn().mockResolvedValue({ error: null });
    chain.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  });
  (createAdminClient as jest.Mock).mockReturnValue({ rpc, from });
  return { rpc };
}

function call() {
  return checkIns(new NextRequest("https://portal.test/api/cron/coach-check-ins", {
    headers: { authorization: `Bearer ${SECRET}` },
  }));
}

describe("coach check-in generated messages", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.CRON_SECRET = SECRET;
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.OPENROUTER_API_KEY;
  });

  it("migration accepts p_message with a NULL fallback to the commitment text", () => {
    const migration = readFileSync(
      join(process.cwd(), "db/migrations/143_coach_checkin_messages.sql"), "utf8");
    expect(migration).toContain("p_message TEXT DEFAULT NULL");
    expect(migration).toContain("coalesce(nullif(btrim(p_message), ''), v_row.commitment)");
    expect(migration).toContain("DROP FUNCTION IF EXISTS deliver_coach_check_in(UUID, UUID)");
  });

  it("delivers the generated message when the LLM succeeds", async () => {
    const { rpc } = mockAdmin();
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: " You're close — one report left. " } }] }),
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("deliver_coach_check_in", {
      p_commitment_id: claimedItem.id,
      p_claim_token: claimedItem.check_in_claim_token,
      p_message: "You're close — one report left.",
    });
  });

  it("still delivers with p_message NULL when the LLM fails", async () => {
    const { rpc } = mockAdmin();
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error("down"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("deliver_coach_check_in", {
      p_commitment_id: claimedItem.id,
      p_claim_token: claimedItem.check_in_claim_token,
      p_message: null,
    });
  });

  it("still delivers with p_message NULL when no LLM key is configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { rpc } = mockAdmin();
    const res = await call();
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("deliver_coach_check_in", {
      p_commitment_id: claimedItem.id,
      p_claim_token: claimedItem.check_in_claim_token,
      p_message: null,
    });
  });
});
