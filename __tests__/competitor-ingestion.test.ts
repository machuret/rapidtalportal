/** @jest-environment node */

import {
  advanceCompetitorCrawl,
  CompetitorIngestionError,
  startCompetitorRefresh,
  type IngestionSource,
} from "@/lib/competitors/ingestion";

const SOURCE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const COMPETITOR_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JOB_ID = "99999999-9999-4999-8999-999999999999";

function source(overrides: Partial<IngestionSource> = {}): IngestionSource {
  return {
    id: SOURCE_ID,
    competitor_id: COMPETITOR_ID,
    client_id: CLIENT_ID,
    source_type: "blog",
    platform: "web",
    url: "https://example.com/blog",
    normalized_url: "https://example.com/blog",
    crawl_scope: "path",
    path_prefix: "/blog",
    status: "active",
    refresh_cadence: "weekly",
    max_pages: 20,
    content_count: 0,
    last_crawled_at: null,
    last_success_at: null,
    next_refresh_at: null,
    last_error: null,
    created_at: "2026-07-29T00:00:00.000Z",
    competitor_cadence: "monthly",
    ...overrides,
  };
}

function chainWith(result: Record<string, unknown>) {
  const chain: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "limit", "order", "insert", "update"]) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn().mockResolvedValue(result);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return chain;
}

beforeEach(() => {
  jest.restoreAllMocks();
  process.env.FIRECRAWL_API_KEY = "test-key";
});

afterAll(() => {
  delete process.env.FIRECRAWL_API_KEY;
});

describe("competitor source ingestion", () => {
  test("social sources remain registered but cannot be scraped without a connector", async () => {
    const admin = { from: jest.fn(), rpc: jest.fn() };
    await expect(startCompetitorRefresh(
      admin,
      source({ source_type: "social_profile", platform: "linkedin", crawl_scope: "profile" }),
      null,
    )).rejects.toEqual(expect.objectContaining<Partial<CompetitorIngestionError>>({
      status: 422,
    }));
    expect(admin.from).not.toHaveBeenCalled();
  });

  test("starts a provider crawl only after checking for an active source job", async () => {
    const queued = {
      id: JOB_ID,
      source_id: SOURCE_ID,
      competitor_id: COMPETITOR_ID,
      client_id: CLIENT_ID,
      status: "queued",
      items_captured: 0,
    };
    const started = { ...queued, status: "crawling", provider_job_id: "fc-job" };
    let crawlJobCalls = 0;
    const from = jest.fn((table: string) => {
      if (table === "competitor_crawl_jobs") {
        crawlJobCalls++;
        if (crawlJobCalls === 1) return chainWith({ data: null, error: null });
        if (crawlJobCalls === 2) return chainWith({ data: queued, error: null });
        return chainWith({ data: started, error: null });
      }
      return chainWith({ data: null, error: null });
    });
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "fc-job" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await startCompetitorRefresh({ from }, source(), "actor-id");

    expect(result).toMatchObject({ id: JOB_ID, status: "crawling" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("https://api.firecrawl.dev/v1/crawl");
    expect(JSON.parse(String((request[1] as RequestInit).body))).toMatchObject({
      url: "https://example.com/blog",
      limit: 20,
      includePaths: ["blog*"],
    });
  });

  test("captures only in-scope pages and finishes with the same lease token", async () => {
    const claimed = {
      id: JOB_ID,
      source_id: SOURCE_ID,
      competitor_id: COMPETITOR_ID,
      client_id: CLIENT_ID,
      status: "crawling",
      provider_job_id: "fc-job",
      lease_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      pages_discovered: 0,
      items_captured: 0,
    };
    const checkpoint = jest.fn();
    const upsert = jest.fn().mockResolvedValue({ data: SOURCE_ID, error: null });
    const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
      if (name === "claim_competitor_crawl_job") {
        return { maybeSingle: jest.fn().mockResolvedValue({ data: claimed, error: null }) };
      }
      if (name === "upsert_competitor_content_item") {
        upsert(args);
        return Promise.resolve({ data: SOURCE_ID, error: null });
      }
      if (name === "checkpoint_competitor_crawl_job") {
        checkpoint(args);
        return {
          single: jest.fn().mockResolvedValue({
            data: { ...claimed, status: args.p_status, items_captured: args.p_items_captured },
            error: null,
          }),
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    let sourceCalls = 0;
    const sourceUpdates: Record<string, unknown>[] = [];
    const from = jest.fn((table: string) => {
      if (table === "competitor_sources") {
        sourceCalls++;
        if (sourceCalls === 1) {
          return chainWith({
            data: { ...source(), competitors: { refresh_cadence: "monthly" } },
            error: null,
          });
        }
        const updateChain = chainWith({ data: null, error: null });
        updateChain.update = jest.fn((value: Record<string, unknown>) => {
          sourceUpdates.push(value);
          return updateChain;
        });
        return updateChain;
      }
      if (table === "competitor_content_items") {
        return chainWith({ count: 1, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        status: "completed",
        total: 2,
        completed: 2,
        data: [
          {
            markdown: "## Useful article\n\nA long enough body to be captured for future analysis.",
            metadata: {
              sourceURL: "https://example.com/blog/useful",
              title: "Useful article",
              publishedTime: "2026-07-20T00:00:00.000Z",
            },
          },
          {
            markdown: "## Pricing\n\nThis sibling page is outside the approved collection section.",
            metadata: { sourceURL: "https://example.com/pricing", title: "Pricing" },
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const result = await advanceCompetitorCrawl({ from, rpc }, JOB_ID, CLIENT_ID);

    expect(result).toMatchObject({ status: "done", items_captured: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      p_client_id: CLIENT_ID,
      p_canonical_url: "https://example.com/blog/useful",
      p_title: "Useful article",
    }));
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({
      p_job_id: JOB_ID,
      p_lease_token: claimed.lease_token,
      p_status: "done",
      p_items_captured: 1,
    }));
    expect(sourceUpdates).toContainEqual(expect.objectContaining({
      status: "active",
      content_count: 1,
      last_error: null,
    }));
  });
});

