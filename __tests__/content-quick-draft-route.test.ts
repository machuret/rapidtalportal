/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/edge-proxy", () => ({ proxyToEdgeFunction: jest.fn() }));

import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { POST } from "@/app/api/content/quick-draft/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT = "22222222-2222-4222-8222-222222222222";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const PIECE_ID = "55555555-5555-4555-8555-555555555555";

function request(clientId = CLIENT_ID) {
  return new NextRequest("https://portal.test/api/content/quick-draft", {
    method: "POST",
    body: JSON.stringify({
      clientId,
      idempotencyKey: KEY,
      title: "Why private credit matters",
      contentType: "linkedin",
      guidance: null,
    }),
    headers: { "content-type": "application/json" },
  });
}

function query(results: Array<{ data: unknown; error: unknown }>) {
  const builder = {
    select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  results.forEach((result) => builder.maybeSingle.mockResolvedValueOnce(result));
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
});

it("rejects another tenant before reading or generating anything", async () => {
  const response = await POST(request(OTHER_CLIENT));
  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(proxyToEdgeFunction).not.toHaveBeenCalled();
});

it("recovers an already-saved idempotent draft without calling the paid provider again", async () => {
  const hash = createHash("sha256").update(JSON.stringify({
    clientId: CLIENT_ID,
    title: "Why private credit matters",
    contentType: "linkedin",
    guidance: null,
  })).digest("hex");
  const project = {
    id: PROJECT_ID,
    client_id: CLIENT_ID,
    title: "Why private credit matters",
    status: "active",
    current_step: "edit",
    idea_snapshot: {}, content_brief: {}, vault_source_ids: [], vault_source_references: [],
    competitor_signals: [], style_snapshot: {}, current_piece_id: PIECE_ID,
    brain_context_snapshot_id: null, quick_create_request_hash: hash,
    created_at: "2026-08-02T00:00:00.000Z", updated_at: "2026-08-02T00:00:00.000Z",
  };
  const projectQuery = query([
    { data: project, error: null },
    { data: project, error: null },
  ]);
  const piece = { id: PIECE_ID, project_id: PROJECT_ID, body: "Saved draft" };
  const pieceQuery = query([{ data: piece, error: null }]);
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => table === "content_projects" ? projectQuery : pieceQuery),
  });

  const response = await POST(request());
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({ recovered: true, piece: { id: PIECE_ID } });
  expect(proxyToEdgeFunction).not.toHaveBeenCalled();
});

it("rejects reuse of an idempotency key with changed content", async () => {
  const projectQuery = query([{ data: {
    id: PROJECT_ID,
    quick_create_request_hash: "a".repeat(64),
    current_step: "generate",
    current_piece_id: null,
  }, error: null }]);
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => projectQuery) });

  const response = await POST(request());

  expect(response.status).toBe(409);
  expect(proxyToEdgeFunction).not.toHaveBeenCalled();
});
