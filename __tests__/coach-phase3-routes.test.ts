/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/notifications", () => ({ notify: jest.fn() }));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { POST as executeAction } from "@/app/api/coach/actions/route";
import { GET as runCheckIns } from "@/app/api/cron/coach-check-ins/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";
const TURN_ID = "44444444-4444-4444-8444-444444444444";
const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";
const routeCtx = { params: Promise.resolve({}) };

function chain(result: unknown) {
  const query: Record<string, jest.Mock> = {};
  for (const method of ["select", "eq"]) query[method] = jest.fn(() => query);
  query.maybeSingle = jest.fn().mockResolvedValue(result);
  return query;
}

describe("Coach Phase 3 behavioural routes", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "client_admin" },
      impersonating: false,
    });
  });

  it("executes a confirmed goal through the idempotent progress RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { ok: true, result: { id: "goal-1" } }, error: null });
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => table === "coach_turns"
        ? chain({ data: { id: TURN_ID }, error: null })
        : chain({ data: null, error: null })),
      rpc,
    });
    const response = await executeAction(new NextRequest("https://rapidtal.online/api/coach/actions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_ID, snapshotId: SNAPSHOT_ID,
        action: { type: "create_goal", idempotencyKey: IDEMPOTENCY_KEY, title: "Reach 50 leads", outcome: "50 qualified leads per month", targetDate: null },
      }),
    }), routeCtx);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("execute_coach_progress_action", expect.objectContaining({
      p_turn_id: TURN_ID, p_client_id: CLIENT_ID, p_owner_id: USER_ID,
      p_idempotency_key: IDEMPOTENCY_KEY,
    }));
  });

  it("blocks progress actions while an admin is impersonating", async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "client_admin" }, impersonating: true,
    });
    const response = await executeAction(new NextRequest("https://rapidtal.online/api/coach/actions", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }), routeCtx);
    expect(response.status).toBe(409);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("records a recoverable heartbeat when check-in claiming fails", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: "temporary" } });
    (createAdminClient as jest.Mock).mockReturnValue({ rpc, from: jest.fn(() => ({ upsert })) });
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";
    const response = await runCheckIns(new NextRequest("https://rapidtal.online/api/cron/coach-check-ins", {
      headers: { authorization: "Bearer test-secret" },
    }));
    process.env.CRON_SECRET = previous;
    expect(response.status).toBe(503);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ stage: "claim", failed: 1 }) }));
  });

  it("releases a failed delivery lease and reports it", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: [{ id: "66666666-6666-4666-8666-666666666666", check_in_claim_token: "77777777-7777-4777-8777-777777777777" }], error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    (createAdminClient as jest.Mock).mockReturnValue({ rpc, from: jest.fn(() => ({ upsert })) });
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";
    const response = await runCheckIns(new NextRequest("https://rapidtal.online/api/cron/coach-check-ins", {
      headers: { authorization: "Bearer test-secret" },
    }));
    process.env.CRON_SECRET = previous;
    expect(response.status).toBe(503);
    expect(rpc).toHaveBeenNthCalledWith(3, "complete_coach_check_in", expect.objectContaining({ p_delivered: false }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ stage: "delivery", failed: 1, releaseFailed: 0 }) }));
  });
});
