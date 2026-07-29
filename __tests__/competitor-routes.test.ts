/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { POST as createCompetitor } from "@/app/api/content/competitors/route";
import { POST as createSource } from "@/app/api/content/competitors/sources/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const COMPETITOR_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const routeCtx = { params: Promise.resolve({}) };

function request(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authenticate(role: ApiUser["role"] = "client_admin") {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role, client_id: CLIENT_ID },
  });
}

function fluent(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ["select", "eq", "insert", "update", "delete", "is", "order", "limit"]) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn().mockResolvedValue(result);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  authenticate();
});

describe("competitor configuration routes", () => {
  test("a VA cannot create competitors even inside their tenant", async () => {
    authenticate("va");
    const response = await createCompetitor(request("https://portal.test/api/content/competitors", {
      client_id: CLIENT_ID,
      name: "Competitor",
      website_url: "https://example.com",
    }), routeCtx);

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test.each([
    "http://example.com",
    "https://127.0.0.1",
    "https://user:password@example.com",
  ])("rejects unsafe competitor website %s before database access", async (websiteUrl) => {
    const response = await createCompetitor(request("https://portal.test/api/content/competitors", {
      client_id: CLIENT_ID,
      name: "Competitor",
      website_url: websiteUrl,
    }), routeCtx);

    expect(response.status).toBe(422);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("creates the competitor and initial source atomically with normalised URL metadata", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: COMPETITOR_ID, error: null });
    (createAdminClient as jest.Mock).mockReturnValue({ rpc });

    const response = await createCompetitor(request("https://portal.test/api/content/competitors", {
      client_id: CLIENT_ID,
      name: " Example Co ",
      website_url: "https://WWW.Example.com/?utm_source=test",
      refresh_cadence: "weekly",
      max_pages: 40,
    }), routeCtx);

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_competitor_with_source", expect.objectContaining({
      p_client_id: CLIENT_ID,
      p_actor_id: USER_ID,
      p_name: "Example Co",
      p_normalized_url: "https://www.example.com/",
      p_source_type: "website",
      p_crawl_scope: "domain",
      p_refresh_cadence: "weekly",
      p_max_pages: 40,
    }));
  });

  test("registers social profile URLs as connector-required without scheduling a crawl", async () => {
    const competitorQuery = fluent({
      data: { id: COMPETITOR_ID, refresh_cadence: "weekly" },
      error: null,
    });
    const sourceQuery = fluent({
      data: {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        source_type: "social_profile",
        platform: "linkedin",
        crawl_scope: "profile",
        status: "connector_required",
      },
      error: null,
    });
    const from = jest.fn((table: string) =>
      table === "competitors" ? competitorQuery : sourceQuery);
    (createAdminClient as jest.Mock).mockReturnValue({ from });

    const response = await createSource(request("https://portal.test/api/content/competitors/sources", {
      client_id: CLIENT_ID,
      competitor_id: COMPETITOR_ID,
      url: "https://linkedin.com/company/example",
    }), routeCtx);

    expect(response.status).toBe(201);
    expect(sourceQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      source_type: "social_profile",
      platform: "linkedin",
      crawl_scope: "profile",
      status: "connector_required",
      next_refresh_at: null,
    }));
  });
});

