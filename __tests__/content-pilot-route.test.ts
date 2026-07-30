/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { GET, POST } from "@/app/api/content/pilot/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const PIECE_ID = "44444444-4444-4444-8444-444444444444";
const routeCtx = { params: Promise.resolve({}) };

function chain(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of [
    "select", "eq", "in", "lt", "order", "limit", "upsert",
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve(result));
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
});

test("pilot total cost comes from the unbounded database aggregate", async () => {
  const tables: Record<string, ReturnType<typeof chain>> = {
    clients: chain({
      data: { content_pilot_enabled: true, content_pilot_started_at: null },
      error: null,
    }),
    content_workflow_events: chain({ data: [], error: null }),
    content_analysis_attempts: chain({
      data: [{ estimated_cost_usd: 0.01, status: "succeeded" }],
      error: null,
    }),
    content_projects: chain({ data: [], error: null }),
    content_pilot_feedback: chain({ data: [], error: null }),
    content_voice_evaluations: chain({ data: [], error: null }),
  };
  const rpc = jest.fn().mockResolvedValue({ data: "123.456789", error: null });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => tables[table]),
    rpc,
  });

  const response = await GET(
    new NextRequest(`https://portal.test/api/content/pilot?client_id=${CLIENT_ID}`),
    routeCtx,
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    analysis: { total_cost_usd: 123.456789 },
  });
  expect(rpc).toHaveBeenCalledWith("content_analysis_total_cost", {
    p_client_id: CLIENT_ID,
  });
});

test("pilot feedback verifies and records the reviewer-selected approved artifact", async () => {
  const client = chain({ data: { content_pilot_enabled: true }, error: null });
  const project = chain({
    data: { id: PROJECT_ID, current_piece_id: "55555555-5555-4555-8555-555555555555" },
    error: null,
  });
  const piece = chain({
    data: { id: PIECE_ID, project_id: PROJECT_ID, status: "approved" },
    error: null,
  });
  const feedback = chain({
    data: { id: "66666666-6666-4666-8666-666666666666", updated_at: "2026-07-30T00:00:00Z" },
    error: null,
  });
  const from = jest.fn((table: string) => {
    if (table === "clients") return client;
    if (table === "content_projects") return project;
    if (table === "content_pieces") return piece;
    if (table === "content_pilot_feedback") return feedback;
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });

  const response = await POST(new NextRequest("https://portal.test/api/content/pilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      project_id: PROJECT_ID,
      piece_id: PIECE_ID,
      voice_accuracy: 5,
      idea_usefulness: 4,
      differentiation_quality: 4,
      source_trust: 5,
      workflow_ease: 4,
    }),
  }), routeCtx);

  expect(response.status).toBe(201);
  expect(piece.eq).toHaveBeenCalledWith("id", PIECE_ID);
  expect(piece.eq).toHaveBeenCalledWith("project_id", PROJECT_ID);
  expect(piece.eq).toHaveBeenCalledWith("status", "approved");
  expect(feedback.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ project_id: PROJECT_ID, piece_id: PIECE_ID }),
    { onConflict: "project_id,reviewer_id" },
  );
});
