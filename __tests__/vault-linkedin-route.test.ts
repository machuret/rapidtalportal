/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/vault-process-trigger", () => ({ scheduleVaultProcess: jest.fn() }));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { scheduleVaultProcess } from "@/lib/vault-process-trigger";
import { POST } from "@/app/api/vault/linkedin/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function chain(result: { data?: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of [
    "select", "eq", "insert", "update", "upsert", "delete", "in",
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIRECRAWL_API_KEY = "test-key";
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
});

afterAll(() => {
  delete process.env.FIRECRAWL_API_KEY;
});

test("collects Equity Access posts without filtering URLs that LinkedIn blocks from direct scraping", async () => {
  const clientQuery = chain({ data: { name: "Equity Access" }, error: null });
  const dnaReadQuery = chain({ data: null, error: null });
  const dnaWriteQuery = chain({ data: null, error: null });
  const vaultQuery = chain({
    data: [{
      id: ITEM_ID,
      title: "Equity Access on LinkedIn",
      source_url: "https://www.linkedin.com/posts/equity-access_equityaccess-activity-7452144320121393153-XzSg",
    }],
    error: null,
  });
  const chunksQuery = chain({ data: null, error: null });
  let dnaCalls = 0;
  const from = jest.fn((table: string) => {
    if (table === "clients") return clientQuery;
    if (table === "company_dna") return ++dnaCalls === 1 ? dnaReadQuery : dnaWriteQuery;
    if (table === "vault_items") return vaultQuery;
    if (table === "vault_chunks") return chunksQuery;
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      success: true,
      data: {
        web: [{
          title: "Equity Access on LinkedIn",
          description: "A public Equity Access post about private lending solutions for mortgage brokers.",
          metadata: {
            sourceURL: "https://au.linkedin.com/posts/equity-access_equityaccess-activity-7452144320121393153-XzSg?utm_source=test",
          },
        }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  const request = new NextRequest("https://portal.test/api/vault/linkedin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      profileUrl: "https://www.linkedin.com/company/equity-access/",
      maxPosts: 1,
    }),
  });

  const response = await POST(request, { params: Promise.resolve({}) });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({ success: true, collected: 1 });
  const searchBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
  expect(searchBody).toMatchObject({
    query: "site:linkedin.com/posts/equity-access",
    ignoreInvalidURLs: false,
  });
  expect(searchBody).not.toHaveProperty("scrapeOptions");
  expect(vaultQuery.upsert).toHaveBeenCalledWith(
    [expect.objectContaining({
      client_id: CLIENT_ID,
      evidence_role: "style_example",
      source_url: "https://www.linkedin.com/posts/equity-access_equityaccess-activity-7452144320121393153-XzSg",
    })],
    { onConflict: "client_id,origin_key" },
  );
  expect(scheduleVaultProcess).toHaveBeenCalledWith(ITEM_ID, CLIENT_ID);
});

test("runs live discovery diagnostics without changing Company DNA or Vault records", async () => {
  const clientQuery = chain({ data: { name: "Equity Access" }, error: null });
  const from = jest.fn((table: string) => {
    if (table === "clients") return clientQuery;
    throw new Error(`Test mode must not access ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      success: true,
      data: { web: [] },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  const request = new NextRequest("https://portal.test/api/vault/linkedin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      profileUrl: "https://www.linkedin.com/company/equity-access/",
      maxPosts: 10,
      mode: "test",
    }),
  });

  const response = await POST(request, { params: Promise.resolve({}) });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({
    success: true,
    test: true,
    discovery: {
      accepted: 0,
      returned: 0,
      attempts: [
        { query: "site:linkedin.com/posts/equity-access", status: 200, returned: 0 },
        { query: 'site:linkedin.com/posts "Equity Access"', status: 200, returned: 0 },
      ],
    },
  });
  expect(from).toHaveBeenCalledTimes(1);
  expect(scheduleVaultProcess).not.toHaveBeenCalled();
});
