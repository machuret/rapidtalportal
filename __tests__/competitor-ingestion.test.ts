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
const LEASE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
    failure_count: 0,
    created_at: "2026-07-29T00:00:00.000Z",
    competitor_cadence: "monthly",
    competitor_status: "active",
    competitor_website_url: "https://example.com",
    ...overrides,
  };
}

function chainWith(result: Record<string, unknown>) {
  // Compact fluent Supabase mock used only inside this test module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of [
    "select", "eq", "in", "limit", "order", "insert", "update", "is",
  ]) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn().mockResolvedValue(result);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return chain;
}

function claimed(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    source_id: SOURCE_ID,
    competitor_id: COMPETITOR_ID,
    client_id: CLIENT_ID,
    status: "crawling",
    provider: "firecrawl_crawl",
    provider_job_id: "fc-job",
    provider_complete: false,
    next_result_url: null,
    cancel_requested_at: null,
    lease_token: LEASE,
    pages_discovered: 0,
    items_captured: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  process.env.FIRECRAWL_API_KEY = "test-key";
  delete process.env.APIFY_API_TOKEN;
});

afterAll(() => {
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.APIFY_API_TOKEN;
});

describe("competitor source ingestion", () => {
  test("personal social sources remain registered but cannot be scraped without a connector", async () => {
    const admin = { from: jest.fn(), rpc: jest.fn() };
    await expect(startCompetitorRefresh(
      admin,
      source({
        source_type: "social_profile",
        platform: "linkedin",
        url: "https://www.linkedin.com/in/example",
        normalized_url: "https://www.linkedin.com/in/example",
        crawl_scope: "profile",
      }),
      null,
    )).rejects.toEqual(expect.objectContaining<Partial<CompetitorIngestionError>>({
      status: 422,
    }));
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test("discovers bounded public company posts before starting a durable batch scrape", async () => {
    const linkedinSource = source({
      source_type: "social_profile",
      platform: "linkedin",
      url: "https://www.linkedin.com/company/example",
      normalized_url: "https://www.linkedin.com/company/example",
      crawl_scope: "profile",
      path_prefix: null,
      max_pages: 10,
      competitor_name: "Example",
    });
    const queued = { ...claimed(), status: "queued", provider_job_id: null };
    const started = { ...queued, status: "crawling", provider_job_id: "batch-job" };
    const rpc = jest.fn(() => ({
      single: jest.fn().mockResolvedValue({ data: queued, error: null }),
    }));
    const from = jest.fn((table: string) =>
      chainWith(table === "competitor_crawl_jobs"
        ? { data: started, error: null }
        : { data: null, error: null }));
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          rawHtml: '<a href="https://www.linkedin.com/posts/example_activity-111">Post</a>',
          links: [
            "https://www.linkedin.com/posts/example_activity-111",
            "https://www.linkedin.com/posts/other_activity-999",
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        // Historical Firecrawl response shape is accepted during provider
        // rollouts as well as the current data.web shape.
        data: [
          { url: "https://www.linkedin.com/posts/example_activity-123" },
          { url: "https://www.linkedin.com/posts/other_activity-456" },
          { url: "https://evil.example/posts/example_activity-789" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "batch-job" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    await startCompetitorRefresh({ from, rpc }, linkedinSource, "actor-id");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      url: "https://www.linkedin.com/company/example/posts/?feedView=all",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.firecrawl.dev/v2/search");
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      includeDomains: ["linkedin.com"],
      limit: 10,
      query: "site:linkedin.com/posts/example",
    });
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.firecrawl.dev/v2/batch/scrape");
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({
      urls: [
        "https://www.linkedin.com/posts/example_activity-111",
        "https://www.linkedin.com/posts/example_activity-123",
      ],
    });
    expect(rpc).toHaveBeenCalledWith("create_competitor_crawl_job", expect.objectContaining({
      p_pages_requested: 11,
    }));
  });

  test("uses the configured Apify LinkedIn actor and stages only company-attributed posts", async () => {
    process.env.APIFY_API_TOKEN = "apify-test-token";
    const linkedinSource = source({
      source_type: "social_profile",
      platform: "linkedin",
      url: "https://www.linkedin.com/company/equity-access",
      normalized_url: "https://www.linkedin.com/company/equity-access",
      crawl_scope: "profile",
      path_prefix: null,
      max_pages: 10,
      competitor_name: "Equity Access",
    });
    const queued = { ...claimed(), status: "queued", provider_job_id: null };
    const started = {
      ...queued,
      status: "ingesting",
      provider: "apify_linkedin",
      provider_job_id: "linkedin-search-1",
      provider_complete: true,
      pages_discovered: 1,
    };
    const leased = { ...started, lease_token: LEASE };
    const checkpointed = { ...leased, lease_token: null };
    const stage = jest.fn();
    const rpc = jest.fn((name: string, args?: Record<string, unknown>) => {
      if (name === "create_competitor_crawl_job") {
        return { single: jest.fn().mockResolvedValue({ data: queued, error: null }) };
      }
      if (name === "claim_competitor_crawl_job") {
        return { single: jest.fn().mockResolvedValue({ data: leased, error: null }) };
      }
      if (name === "stage_competitor_crawl_pages") {
        stage(args);
        return Promise.resolve({ data: 1, error: null });
      }
      if (name === "checkpoint_competitor_crawl_job") {
        return { single: jest.fn().mockResolvedValue({ data: checkpointed, error: null }) };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const from = jest.fn((table: string) =>
      chainWith(table === "competitor_crawl_jobs"
        ? { data: started, error: null }
        : { data: null, error: null }));
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([
        {
          linkedinUrl: "https://www.linkedin.com/posts/equity-access_equityaccess-activity-7467025568966836224-HoVn",
          content: "A sufficiently detailed Equity Access company post about private credit and property investing.",
          author: { name: "Equity Access" },
          postedAt: "2026-07-20T02:00:00.000Z",
        },
        {
          linkedinUrl: "https://www.linkedin.com/posts/unrelated-company_activity-999",
          content: "This unrelated company post must never enter the competitor mini-vault.",
        },
      ]), { status: 201, headers: { "content-type": "application/json" } }),
    );

    const result = await startCompetitorRefresh({ from, rpc }, linkedinSource, "actor-id");

    expect(result).toMatchObject({
      status: "ingesting",
      provider: "apify_linkedin",
      provider_complete: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/acts/harvestapi~linkedin-company-posts/run-sync-get-dataset-items",
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer apify-test-token",
    });
    expect(stage).toHaveBeenCalledWith(expect.objectContaining({
      p_pages: [expect.objectContaining({
        markdown: expect.stringContaining("private credit"),
        metadata: expect.objectContaining({
          sourceURL: expect.stringContaining("/posts/equity-access_"),
        }),
      })],
    }));
  });

  test("stages public LinkedIn search content directly instead of re-scraping blocked post pages", async () => {
    const linkedinSource = source({
      source_type: "social_profile",
      platform: "linkedin",
      url: "https://www.linkedin.com/company/equity-access",
      normalized_url: "https://www.linkedin.com/company/equity-access",
      crawl_scope: "profile",
      path_prefix: null,
      max_pages: 10,
      competitor_name: "Equity Access",
    });
    const queued = { ...claimed(), status: "queued", provider_job_id: null };
    const started = {
      ...queued,
      status: "ingesting",
      provider: "firecrawl_search",
      provider_job_id: "linkedin-search-1",
      provider_complete: true,
      pages_discovered: 1,
    };
    const leased = { ...started, lease_token: LEASE };
    const checkpointed = { ...leased, lease_token: null };
    const stage = jest.fn();
    const rpc = jest.fn((name: string, args?: Record<string, unknown>) => {
      if (name === "create_competitor_crawl_job") {
        return { single: jest.fn().mockResolvedValue({ data: queued, error: null }) };
      }
      if (name === "claim_competitor_crawl_job") {
        return { single: jest.fn().mockResolvedValue({ data: leased, error: null }) };
      }
      if (name === "stage_competitor_crawl_pages") {
        stage(args);
        return Promise.resolve({ data: 1, error: null });
      }
      if (name === "checkpoint_competitor_crawl_job") {
        return { single: jest.fn().mockResolvedValue({ data: checkpointed, error: null }) };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const from = jest.fn((table: string) =>
      chainWith(table === "competitor_crawl_jobs"
        ? { data: started, error: null }
        : { data: null, error: null }));
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { rawHtml: "", links: [], markdown: "" },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          web: [{
            url: "https://www.linkedin.com/posts/equity-access_equityaccess-activity-7452144320121393153-XzSg",
            title: "Equity Access on LinkedIn",
            description: "Equity Access helps brokers structure private lending scenarios with speed and certainty.",
          }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await startCompetitorRefresh({ from, rpc }, linkedinSource, "actor-id");

    expect(result).toMatchObject({
      status: "ingesting",
      provider: "firecrawl_search",
      provider_complete: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      scrapeOptions: {
        formats: [{ type: "markdown" }],
        onlyMainContent: true,
      },
    });
    expect(stage).toHaveBeenCalledWith(expect.objectContaining({
      p_job_id: JOB_ID,
      p_lease_token: LEASE,
      p_provider_complete: true,
      p_pages: [expect.objectContaining({
        markdown: expect.stringContaining("private lending"),
        metadata: expect.objectContaining({
          sourceURL: expect.stringContaining("/posts/equity-access_"),
        }),
      })],
    }));
  });

  test("falls back to the attributed public posts feed instead of reporting no content", async () => {
    const linkedinSource = source({
      source_type: "social_profile",
      platform: "linkedin",
      url: "https://www.linkedin.com/company/equity-access",
      normalized_url: "https://www.linkedin.com/company/equity-access",
      crawl_scope: "profile",
      path_prefix: null,
      max_pages: 10,
      competitor_name: "Equity Access",
    });
    const queued = { ...claimed(), status: "queued", provider_job_id: null };
    const started = { ...queued, status: "crawling", provider_job_id: "batch-job" };
    const rpc = jest.fn(() => ({
      single: jest.fn().mockResolvedValue({ data: queued, error: null }),
    }));
    const from = jest.fn((table: string) =>
      chainWith(table === "competitor_crawl_jobs"
        ? { data: started, error: null }
        : { data: null, error: null }));
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { rawHtml: "", links: [] },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { web: [] },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "batch-job" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    await expect(startCompetitorRefresh(
      { from, rpc },
      linkedinSource,
      "actor-id",
    )).resolves.toMatchObject({ provider_job_id: "batch-job" });

    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({
      urls: ["https://www.linkedin.com/company/equity-access/posts/?feedView=all"],
    });
  });

  test("atomically reserves tenant budget before starting a v2 provider crawl", async () => {
    const queued = { ...claimed(), status: "queued", provider_job_id: null };
    const started = { ...queued, status: "crawling", provider_job_id: "fc-job" };
    const rpc = jest.fn((name: string) => {
      if (name !== "create_competitor_crawl_job") throw new Error(`Unexpected RPC ${name}`);
      return { single: jest.fn().mockResolvedValue({ data: queued, error: null }) };
    });
    let jobCalls = 0;
    const from = jest.fn((table: string) => {
      if (table === "competitor_crawl_jobs") {
        jobCalls++;
        return chainWith({ data: started, error: null });
      }
      if (table === "competitor_sources") return chainWith({ data: null, error: null });
      throw new Error(`Unexpected table ${table}`);
    });
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "fc-job" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await startCompetitorRefresh({ from, rpc }, source(), "actor-id");

    expect(result).toMatchObject({ id: JOB_ID, status: "crawling" });
    expect(rpc).toHaveBeenCalledWith("create_competitor_crawl_job", expect.objectContaining({
      p_client_id: CLIENT_ID,
      p_pages_requested: 20,
    }));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/crawl",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      url: "https://example.com/blog",
      limit: 20,
      sitemap: "skip",
      includePaths: ["^/blog(?:/.*)?$"],
    });
    expect(jobCalls).toBe(1);
  });

  test("checkpoints provider results before any content write", async () => {
    const checkpoint = jest.fn();
    const stage = jest.fn();
    const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
      if (name === "claim_competitor_crawl_job") {
        return { maybeSingle: jest.fn().mockResolvedValue({ data: claimed(), error: null }) };
      }
      if (name === "stage_competitor_crawl_pages") {
        stage(args);
        return Promise.resolve({ data: 1, error: null });
      }
      if (name === "checkpoint_competitor_crawl_job") {
        checkpoint(args);
        return {
          single: jest.fn().mockResolvedValue({
            data: { ...claimed(), status: args.p_status, pages_discovered: args.p_pages_discovered },
            error: null,
          }),
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const from = jest.fn((table: string) => {
      if (table === "competitor_sources") {
        return chainWith({
          data: { ...source(), competitors: { refresh_cadence: "monthly", status: "active", website_url: "https://example.com" } },
          error: null,
        });
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
            metadata: { sourceURL: "https://example.com/blog/useful", title: "Useful article" },
          },
          {
            markdown: "## Pricing\n\nThis sibling page is outside the approved collection section.",
            metadata: { sourceURL: "https://example.com/pricing", title: "Pricing" },
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const result = await advanceCompetitorCrawl({ from, rpc }, JOB_ID, CLIENT_ID);

    expect(result).toMatchObject({ status: "ingesting", pages_discovered: 2 });
    expect(stage).toHaveBeenCalledWith(expect.objectContaining({
      p_job_id: JOB_ID,
      p_lease_token: LEASE,
      p_provider_complete: true,
      p_pages: [expect.objectContaining({
        metadata: expect.objectContaining({ sourceURL: "https://example.com/blog/useful" }),
      })],
    }));
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({ p_status: "ingesting" }));
  });

  test("commits one bounded staged batch and finalizes removal tracking", async () => {
    const row = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      payload: {
        markdown: "## Useful article\n\nA long enough body to be captured for future analysis.",
        metadata: { sourceURL: "https://www.example.com/blog/useful", title: "Useful article" },
      },
    };
    const commit = jest.fn();
    const finalize = jest.fn();
    const done = { ...claimed(), status: "done", provider_complete: true, items_captured: 1 };
    const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
      if (name === "claim_competitor_crawl_job") {
        return {
          maybeSingle: jest.fn().mockResolvedValue({
            data: claimed({ provider_complete: true, pages_discovered: 2 }),
            error: null,
          }),
        };
      }
      if (name === "commit_competitor_crawl_page") {
        commit(args);
        return Promise.resolve({ data: SOURCE_ID, error: null });
      }
      if (name === "finalize_competitor_crawl_job") {
        finalize(args);
        return { single: jest.fn().mockResolvedValue({ data: done, error: null }) };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    let pageCalls = 0;
    const from = jest.fn((table: string) => {
      if (table === "competitor_sources") {
        return chainWith({
          data: { ...source(), competitors: { refresh_cadence: "monthly", status: "active", website_url: "https://example.com" } },
          error: null,
        });
      }
      if (table === "competitor_crawl_pages") {
        pageCalls++;
        return pageCalls === 1
          ? chainWith({ data: [row], error: null })
          : chainWith({ count: 0, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await advanceCompetitorCrawl({ from, rpc }, JOB_ID, CLIENT_ID);

    expect(result).toMatchObject({ status: "done", items_captured: 1 });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      p_job_id: JOB_ID,
      p_page_id: row.id,
      p_canonical_url: "https://www.example.com/blog/useful",
    }));
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({
      p_authoritative: true,
      p_lease_token: LEASE,
    }));
  });

  test("a pause request cancels the job instead of reactivating the source", async () => {
    const checkpoint = jest.fn();
    const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
      if (name === "claim_competitor_crawl_job") {
        return { maybeSingle: jest.fn().mockResolvedValue({ data: claimed(), error: null }) };
      }
      if (name === "checkpoint_competitor_crawl_job") {
        checkpoint(args);
        return {
          single: jest.fn().mockResolvedValue({
            data: { ...claimed(), status: "cancelled" },
            error: null,
          }),
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const from = jest.fn(() => chainWith({
      data: { ...source({ status: "paused" }), competitors: { refresh_cadence: "monthly", status: "active" } },
      error: null,
    }));
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await advanceCompetitorCrawl({ from, rpc }, JOB_ID, CLIENT_ID);

    expect(result).toMatchObject({ status: "cancelled" });
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({ p_status: "cancelled" }));
  });
});
