/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { POST as suggestGap } from "@/app/api/coach/library-gaps/route";
import { GET as libraryQuality } from "@/app/api/admin/library/quality/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";
const SUGGESTION_ID = "44444444-4444-4444-8444-444444444444";
const routeCtx = { params: Promise.resolve({}) };

function query(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> & { then?: PromiseLike<unknown>["then"] } = {};
  for (const method of ["select", "eq", "gte", "order", "limit"]) chain[method] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  chain.single = jest.fn().mockResolvedValue(result);
  chain.insert = jest.fn(() => chain);
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe("Coach Phase 4 routes", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "client_admin" },
      impersonating: false,
    });
  });

  it("requires explicit consent before a private topic enters the Library queue", async () => {
    const response = await suggestGap(new NextRequest("https://rapidtal.online/api/coach/library-gaps", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, snapshotId: SNAPSHOT_ID, topic: "Facebook ads basics", consent: false }),
    }), routeCtx);
    expect(response.status).toBe(422);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("stores only a consented topic bound to the authenticated owner's private snapshot", async () => {
    let gapCalls = 0;
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "brain_context_snapshots") return query({
          data: { id: SNAPSHOT_ID, created_by: USER_ID, snapshot: { request: { actor: { conversationVisibility: "private_coach" } } } },
          error: null,
        });
        gapCalls++;
        return gapCalls === 1
          ? query({ data: null, error: null })
          : query({ data: { id: SUGGESTION_ID, status: "open", created_at: "2026-08-01T00:00:00Z" }, error: null });
      }),
    });
    const response = await suggestGap(new NextRequest("https://rapidtal.online/api/coach/library-gaps", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, snapshotId: SNAPSHOT_ID, topic: "Facebook ads basics", consent: true }),
    }), routeCtx);
    expect(response.status).toBe(201);
    expect((createAdminClient as jest.Mock).mock.results[0].value.from).toHaveBeenCalledWith("business_library_gap_suggestions");
  });

  it("never exposes private Coach text in admin Library quality analytics", async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: null, role: "super_admin" }, impersonating: false,
    });
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "business_library_chunks") return query({ data: [{ id: "c", embedded_at: "2026-08-01", embedding_error: null }], error: null });
        if (table === "business_library_gap_suggestions") return query({ data: [], error: null });
        return query({ data: [{ rating: 1 }, { rating: -1 }, { rating: 1 }], error: null });
      }),
    });
    const response = await libraryQuality(new NextRequest("https://rapidtal.online/api/admin/library/quality"), routeCtx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.coachFeedback).toEqual(expect.objectContaining({ positive: 2, negative: 1, satisfaction: 67 }));
    expect(JSON.stringify(body)).not.toContain("question");
    expect(JSON.stringify(body)).not.toContain("answer");
  });
});
