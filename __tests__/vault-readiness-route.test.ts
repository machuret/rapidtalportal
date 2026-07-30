/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { GET } from "@/app/api/vault/readiness/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const routeCtx = { params: Promise.resolve({}) };

function chain(result: { data: unknown; error: unknown; count?: number | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "or", "order", "limit"]) {
    builder[method] = jest.fn(() => builder);
  }
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

test("rejects a cross-tenant readiness request before reading Vault data", async () => {
  const response = await GET(
    new NextRequest(`https://portal.test/api/vault/readiness?clientId=${OTHER_CLIENT_ID}`),
    routeCtx,
  );

  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("returns deterministic readiness from tenant-scoped facts and query history", async () => {
  const from = jest.fn((table: string) => {
    if (table === "vault_items") {
      return chain({
        data: [{
          status: "ready",
          id: "44444444-4444-4444-8444-444444444444",
          title: "Services",
          category: "service",
          tags: ["private lending"],
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-20T00:00:00.000Z",
          indexed_at: "2026-07-20T00:01:00.000Z",
          evidence_role: "factual",
          authority_level: "authoritative",
          knowledge_status: "active",
          time_sensitive: false,
          valid_from: null,
          valid_until: null,
          review_due_at: null,
          has_conflict: false,
        }],
        error: null,
      });
    }
    if (table === "vault_queries") {
      return chain({
        data: [{
          id: "55555555-5555-4555-8555-555555555555",
          question: "What is the approval policy?",
          gap_key: "what is the approval policy?",
          gap_status: "open",
          gap_importance: "high",
          owner_id: null,
          recommended_source: "Approvals policy",
          created_at: "2026-07-25T00:00:00.000Z",
        }],
        error: null,
        count: 1,
      });
    }
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });

  const response = await GET(
    new NextRequest(`https://portal.test/api/vault/readiness?clientId=${CLIENT_ID}`),
    routeCtx,
  );
  const json = await response.json();

  expect(response.status).toBe(200);
  expect(json).toMatchObject({
    status: "developing",
    metrics: {
      total: 1,
      ready: 1,
      searchable: 1,
      openGaps: 1,
      questionsTested: 1,
    },
    gaps: ["What is the approval policy?"],
  });
  expect(from).toHaveBeenCalledWith("vault_items");
  expect(from).toHaveBeenCalledWith("vault_queries");
});
