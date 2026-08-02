/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/brain/coach-quality-gate", () => ({
  evaluateCoachQuality: jest.fn(() => ({ passed: true, issues: [] })),
}));

import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PATCH } from "@/app/api/coach/threads/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORIGINAL_SNAPSHOT = "22222222-2222-4222-8222-222222222222";
const DEEP_SNAPSHOT = "33333333-3333-4333-8333-333333333333";
const routeCtx = { params: Promise.resolve({}) };

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    select: jest.fn(), update: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function request() {
  return new NextRequest("https://portal.test/api/coach/threads", {
    method: "PATCH",
    body: JSON.stringify({
      clientId: CLIENT_ID,
      originalSnapshotId: ORIGINAL_SNAPSHOT,
      deepAnswer: "A durable deeper answer grounded in the selected company context.",
      deepSnapshotId: DEEP_SNAPSHOT,
      sources: [],
      suggestions: [],
      libraryAvailability: "not_requested",
      warnings: [],
    }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
});

it("saves a deep answer only against the owner's original turn", async () => {
  const snapshot = query({ data: { id: DEEP_SNAPSHOT }, error: null });
  const turn = query({ data: { id: "44444444-4444-4444-8444-444444444444" }, error: null });
  const from = jest.fn((table: string) => table === "brain_context_snapshots" ? snapshot : turn);
  (createAdminClient as jest.Mock).mockReturnValue({ from });

  const response = await PATCH(request(), routeCtx);

  expect(response.status).toBe(200);
  expect(snapshot.eq.mock.calls).toEqual(expect.arrayContaining([
    ["client_id", CLIENT_ID],
    ["created_by", USER_ID],
  ]));
  expect(turn.eq.mock.calls).toEqual(expect.arrayContaining([
    ["client_id", CLIENT_ID],
    ["owner_id", USER_ID],
    ["brain_context_snapshot_id", ORIGINAL_SNAPSHOT],
  ]));
});

it("does not mutate history when the deeper snapshot is not owned by the caller", async () => {
  const snapshot = query({ data: null, error: null });
  const from = jest.fn(() => snapshot);
  (createAdminClient as jest.Mock).mockReturnValue({ from });

  const response = await PATCH(request(), routeCtx);

  expect(response.status).toBe(409);
  expect(from).toHaveBeenCalledTimes(1);
  expect(snapshot.update).not.toHaveBeenCalled();
});
