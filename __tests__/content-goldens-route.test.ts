/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { PATCH, POST } from "@/app/api/content/goldens/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const GOLDEN_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-07-30T00:00:00.000Z";
const routeCtx = { params: Promise.resolve({}) };

function chain(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of ["select", "eq", "insert", "update"]) builder[method] = jest.fn(() => builder);
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  return builder;
}

function request(body: unknown) {
  return new NextRequest("https://portal.test/api/content/goldens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
});

test("stores a deterministic hash and keeps new goldens proposed", async () => {
  const inserted = chain({
    data: { id: GOLDEN_ID, status: "proposed", content_hash: "a".repeat(64) },
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => inserted) });
  const response = await POST(request({
    client_id: CLIENT_ID,
    channel: "linkedin",
    title: "Published client example",
    body: "A sufficiently detailed original published client example for a private voice evaluation.",
    content_type: "founder-led",
    evaluation_permission: true,
  }), routeCtx);
  expect(response.status).toBe(201);
  expect(inserted.insert).toHaveBeenCalledWith(expect.objectContaining({
    client_id: CLIENT_ID,
    status: "proposed",
    content_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
  }));
});

test("returns an edited benchmark to proposed status for explicit reapproval", async () => {
  const updated = chain({
    data: { id: GOLDEN_ID, status: "proposed", updated_at: "2026-07-30T01:00:00.000Z" },
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => updated) });
  const response = await PATCH(request({
    client_id: CLIENT_ID,
    id: GOLDEN_ID,
    title: "Edited published title",
    expected_updated_at: UPDATED_AT,
  }), routeCtx);
  expect(response.status).toBe(200);
  expect(updated.update).toHaveBeenCalledWith(expect.objectContaining({
    title: "Edited published title",
    status: "proposed",
    approved_by: null,
    approved_at: null,
  }));
});

test("does not let a VA create or edit evaluation controls", async () => {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "va", client_id: CLIENT_ID },
  });
  const response = await POST(request({
    client_id: CLIENT_ID,
    channel: "linkedin",
    title: "VA example",
    body: "This otherwise valid example must not become an evaluation control through a VA write.",
    content_type: "educational",
  }), routeCtx);
  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});
