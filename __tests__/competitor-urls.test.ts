/** @jest-environment node */

import {
  isPrivateHostname,
  nextRefreshAt,
  resolveCompetitorUrl,
} from "@/lib/competitors/urls";
import {
  buildCompetitorCrawlRequest,
  capturedPageBelongsToSource,
  type IngestionSource,
} from "@/lib/competitors/ingestion";

function source(overrides: Partial<IngestionSource> = {}): IngestionSource {
  return {
    id: "source",
    competitor_id: "competitor",
    client_id: "client",
    source_type: "blog",
    platform: "web",
    url: "https://example.com/blog",
    normalized_url: "https://example.com/blog",
    crawl_scope: "path",
    path_prefix: "/blog",
    status: "active",
    refresh_cadence: null,
    max_pages: 30,
    content_count: 0,
    last_crawled_at: null,
    last_success_at: null,
    next_refresh_at: null,
    last_error: null,
    created_at: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("competitor URL resolution", () => {
  test.each([
    "localhost",
    "127.0.0.1",
    "10.1.2.3",
    "172.16.10.2",
    "192.168.1.2",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "service.internal",
    "printer.local",
  ])("blocks private hostname %s", (hostname) => {
    expect(isPrivateHostname(hostname)).toBe(true);
  });

  test.each([
    "http://example.com",
    "https://localhost/page",
    "https://127.0.0.1/page",
    "https://user:password@example.com",
    "https://example.com:8443/page",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => resolveCompetitorUrl(url)).toThrow();
  });

  test("normalises tracking parameters and detects websites", () => {
    expect(resolveCompetitorUrl("https://WWW.Example.com/?utm_source=test&b=2&a=1#top")).toMatchObject({
      normalizedUrl: "https://www.example.com/?a=1&b=2",
      sourceType: "website",
      platform: "web",
      crawlScope: "domain",
      requiresConnector: false,
    });
  });

  test.each([
    ["https://example.com/sitemap.xml", "sitemap", "sitemap", "web"],
    ["https://example.com/feed", "rss", "feed", "rss"],
    ["https://example.com/blog", "blog", "path", "web"],
    ["https://example.com/blog/article", "page", "exact", "web"],
    ["https://example.com/about", "page", "exact", "web"],
    ["https://linkedin.com/company/example", "social_profile", "profile", "linkedin"],
    ["https://youtube.com/@example", "youtube", "profile", "youtube"],
  ])("classifies %s", (url, sourceType, scope, platform) => {
    expect(resolveCompetitorUrl(url)).toMatchObject({
      sourceType,
      crawlScope: scope,
      platform,
    });
  });

  test("allows an explicit scope for ordinary public pages", () => {
    expect(resolveCompetitorUrl("https://example.com/resources/guide", "domain")).toMatchObject({
      sourceType: "website",
      crawlScope: "domain",
    });
    expect(resolveCompetitorUrl("https://example.com/resources/guide", "exact")).toMatchObject({
      sourceType: "page",
      crawlScope: "exact",
    });
  });

  test("calculates deterministic refresh windows", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRefreshAt("manual", from)).toBeNull();
    expect(nextRefreshAt("daily", from)).toBe("2026-01-02T00:00:00.000Z");
    expect(nextRefreshAt("weekly", from)).toBe("2026-01-08T00:00:00.000Z");
    expect(nextRefreshAt("monthly", from)).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("competitor crawl boundaries", () => {
  test("a path-scoped source cannot capture sibling or external pages", () => {
    const blog = source();
    expect(capturedPageBelongsToSource("https://example.com/blog/post", blog)).toBe(true);
    expect(capturedPageBelongsToSource("https://example.com/pricing", blog)).toBe(false);
    expect(capturedPageBelongsToSource("https://example.com/blogger/post", blog)).toBe(false);
    expect(capturedPageBelongsToSource("https://other.example/blog/post", blog)).toBe(false);
    expect(capturedPageBelongsToSource("http://example.com/blog/post", blog)).toBe(false);
  });

  test("an exact source accepts only the configured page", () => {
    const exact = source({
      source_type: "page",
      url: "https://example.com/guide",
      normalized_url: "https://example.com/guide",
      crawl_scope: "exact",
      path_prefix: null,
      max_pages: 20,
    });
    expect(capturedPageBelongsToSource("https://example.com/guide/", exact)).toBe(true);
    expect(capturedPageBelongsToSource("https://example.com/guide/part-two", exact)).toBe(false);
    expect(buildCompetitorCrawlRequest(exact)).toMatchObject({ limit: 1, maxDepth: 0 });
  });

  test("path collection is constrained at the provider as well as ingestion", () => {
    expect(buildCompetitorCrawlRequest(source())).toMatchObject({
      url: "https://example.com/blog",
      limit: 30,
      includePaths: ["blog*"],
    });
  });
});
