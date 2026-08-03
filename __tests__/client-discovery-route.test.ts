/** @jest-environment node */

import { NextRequest } from "next/server";
import { safeDiscoveryQuery } from "@/lib/discovery/types";

const TENANT_ID = "22222222-2222-4222-8222-222222222222";

jest.mock("@/lib/api-auth", () => ({
  requireApiAuth: jest.fn(async () => ({ user: {
    id: "11111111-1111-4111-8111-111111111111",
    client_id: "22222222-2222-4222-8222-222222222222",
    role: "client_admin",
  } })),
}));
jest.mock("@/lib/api/csrf", () => ({ originRejected: () => false }));
jest.mock("@/lib/error-tracking", () => ({ captureError: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  clientDiscoveryLimiter: { check: jest.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })) },
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

import { POST } from "@/app/api/discovery/search/route";
import { createClient } from "@/lib/supabase/server";

type MethodCall = { table: string; method: string; args: unknown[] };

function database(outcomes: Record<string, Array<Record<string, unknown>>>) {
  const calls: MethodCall[] = [];
  const from = jest.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "ilike", "or", "in", "order", "limit", "abortSignal"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: outcomes[table] ?? [], error: null }).then(resolve, reject);
    return builder;
  });
  return { db: { from }, calls };
}

describe("Sprint 6 client discovery API", () => {
  test("searches only the authenticated tenant, ranks useful matches and returns no record bodies", async () => {
    const { db, calls } = database({
      tasks: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Acme follow up", status: "todo" }],
      notebook_pages: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", placement_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Acme meeting" }],
      vault_items: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: "Acme dossier", status: "ready" }],
      content_pieces: [], content_projects: [],
      competitors: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Acme", website_url: "https://acme.test", status: "active" }],
      crm_contacts: [{ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", first_name: "Acme", last_name: "Owner", company: "Acme", status: "lead" }],
      prospecting_prospects: [],
    });
    (createClient as jest.Mock).mockResolvedValue(db);

    const response = await POST(new NextRequest("https://portal.test/api/discovery/search", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "Acme", limit: 25 }),
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0]).toMatchObject({ kind: "competitor", title: "Acme" });
    expect(JSON.stringify(body)).not.toMatch(/notes|description|body|email@/iu);

    for (const table of ["tasks", "vault_items", "content_pieces", "content_projects", "competitors", "crm_contacts", "prospecting_prospects"]) {
      expect(calls).toContainEqual(expect.objectContaining({ table, method: "eq", args: ["client_id", TENANT_ID] }));
    }
    // Notebook has no client_id column; the route deliberately relies on the
    // caller session and participant-only RLS instead of a service client.
    expect(calls.some((call) => call.table === "notebook_pages" && call.method === "eq" && call.args[0] === "client_id")).toBe(false);
  });

  test("normalises PostgREST control characters before building filters", () => {
    expect(safeDiscoveryQuery("  Acme,or(status.eq.secret)  ")).toBe("Acme or status.eq.secret");
    expect(safeDiscoveryQuery("%%%%")).toBe("");
  });
});
