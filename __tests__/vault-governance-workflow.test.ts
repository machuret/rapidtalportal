/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/edge-proxy", () => ({ proxyToEdgeFunction: jest.fn() }));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { POST as teach } from "@/app/api/vault/teach/route";
import { POST as updateGap } from "@/app/api/vault/gaps/route";
import { PATCH as updateItem } from "@/app/api/vault/[id]/route";
import { GET as getVersions } from "@/app/api/vault/[id]/versions/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const GAP_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const routeCtx = { params: Promise.resolve({}) };

function request(path: string, body: unknown, method = "POST") {
  return new NextRequest(`https://portal.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chain(result: { data?: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "ilike", "order", "limit", "update"]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
});

test("teaching a gap uses the atomic database operation", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: "55555555-5555-4555-8555-555555555555",
    error: null,
  });
  const from = jest.fn();
  (createAdminClient as jest.Mock).mockReturnValue({ from, rpc });

  const response = await teach(request("/api/vault/teach", {
    clientId: CLIENT_ID,
    gapId: GAP_ID,
    question: "What is the approval policy?",
    answer: "Client administrators approve final content.",
  }), routeCtx);

  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("resolve_vault_gap_with_answer", {
    p_gap_id: GAP_ID,
    p_client_id: CLIENT_ID,
    p_actor_id: USER_ID,
    p_answer: "Client administrators approve final content.",
  });
  expect(from).not.toHaveBeenCalled();
});

test("a VA cannot govern or resolve knowledge gaps", async () => {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "va", client_id: CLIENT_ID },
  });

  const response = await updateGap(request("/api/vault/gaps", {
    clientId: CLIENT_ID,
    gapId: GAP_ID,
    action: "claim",
  }), routeCtx);

  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("resolving a gap with a source delegates tenant and source checks to the RPC", async () => {
  const gapQuery = chain({
    data: {
      id: GAP_ID,
      gap_key: "what is the approval policy?",
      question: "What is the approval policy?",
    },
    error: null,
  });
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => gapQuery),
    rpc,
  });

  const response = await updateGap(request("/api/vault/gaps", {
    clientId: CLIENT_ID,
    gapId: GAP_ID,
    action: "resolve",
    vaultItemId: ITEM_ID,
  }), routeCtx);

  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("resolve_vault_gap_with_item", {
    p_gap_id: GAP_ID,
    p_client_id: CLIENT_ID,
    p_actor_id: USER_ID,
    p_vault_item_id: ITEM_ID,
  });
});

test("a VA cannot change source authority even when they created the item", async () => {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "va", client_id: CLIENT_ID },
  });
  const itemQuery = chain({
    data: { id: ITEM_ID, client_id: CLIENT_ID, created_by: USER_ID },
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => itemQuery),
  });

  const response = await updateItem(
    request(`/api/vault/${ITEM_ID}`, {
      clientId: CLIENT_ID,
      authority_level: "authoritative",
    }, "PATCH"),
    { params: Promise.resolve({ id: ITEM_ID }) },
  );

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "Only client administrators can govern source authority and lifecycle.",
  });
});

test("source history cannot be read through a cross-tenant identifier", async () => {
  const otherClientId = "99999999-9999-4999-8999-999999999999";
  const response = await getVersions(
    new NextRequest(
      `https://portal.test/api/vault/${ITEM_ID}/versions?clientId=${otherClientId}`,
    ),
    { params: Promise.resolve({ id: ITEM_ID }) },
  );

  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("the migration enforces lifecycle-safe retrieval and traceable gap resolution", () => {
  const sql = readFileSync(
    join(process.cwd(), "db/migrations/117_vault_governance_workflow.sql"),
    "utf8",
  );

  expect(sql).toContain("authority_level TEXT NOT NULL");
  expect(sql).toContain("knowledge_status TEXT NOT NULL");
  expect(sql).toContain("resolved_by_vault_item_id UUID REFERENCES vault_items");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS vault_item_versions");
  expect(sql).toContain("CREATE TRIGGER vault_items_capture_version");
  expect(sql).toContain("resolve_vault_gap_with_answer");
  expect(sql).toContain("resolve_vault_gap_with_item");
  expect(sql).toContain("AND vi.knowledge_status = 'active'");
  expect(sql).toContain("AND vi.has_conflict = false");
  expect(sql).toContain("vi.valid_until IS NULL OR vi.valid_until >= current_date");
  expect(sql).toContain("vi.review_due_at IS NULL OR vi.review_due_at > clock_timestamp()");
});
