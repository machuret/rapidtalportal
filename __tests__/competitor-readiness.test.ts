/** @jest-environment node */

import {
  competitorSourceMatchesIdentity,
  competitorSourceIdentityWarnings,
  evaluateCompetitorReadiness,
} from "@/lib/competitors/readiness";

const base = {
  source_count: 1,
  collectable_source_count: 1,
  captured_items: 30,
  article_count: 0,
  social_post_count: 0,
  distinct_platforms: 1,
  content_characters: 600_000,
  latest_capture: "2026-07-29T00:00:00.000Z",
  readiness_score: 90,
  ready: true,
};

describe("competitor readiness dimensions", () => {
  beforeAll(() => {
    jest.spyOn(Date, "now").mockReturnValue(
      new Date("2026-07-30T00:00:00.000Z").getTime(),
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("does not call a large website-only corpus content-strategy ready", () => {
    const readiness = evaluateCompetitorReadiness(base);
    expect(readiness.positioning_ready).toBe(true);
    expect(readiness.positioning_readiness_score).toBe(90);
    expect(readiness.content_strategy_ready).toBe(false);
    expect(readiness.editorial_readiness_score).toBeLessThan(30);
    expect(readiness.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining("No social posts"),
      expect.stringContaining("No articles"),
      expect.stringContaining("not ready for broad content-strategy"),
    ]));
  });

  test("recognises a fresh, mixed editorial corpus", () => {
    const readiness = evaluateCompetitorReadiness({
      ...base,
      article_count: 4,
      social_post_count: 12,
      distinct_platforms: 3,
    });
    expect(readiness.content_strategy_ready).toBe(true);
    expect(readiness.editorial_readiness_score).toBeGreaterThanOrEqual(80);
  });

  test("flags unrelated web domains but accepts social profiles and subdomains", () => {
    expect(competitorSourceIdentityWarnings(
      "https://securelending.com.au",
      [
        { url: "https://blog.securelending.com.au/articles", platform: "web" },
        { url: "https://www.linkedin.com/company/secure-lending", platform: "linkedin" },
        { url: "https://assetline.com.au", platform: "web" },
      ],
    )).toEqual([
      expect.stringContaining("assetline.com.au"),
    ]);
  });

  test("enforces owned-domain identity while allowing platform profiles", () => {
    expect(competitorSourceMatchesIdentity(
      "https://securelending.com.au",
      { url: "https://blog.securelending.com.au/articles", platform: "web" },
    )).toBe(true);
    expect(competitorSourceMatchesIdentity(
      "https://securelending.com.au",
      { url: "https://assetline.com.au", platform: "web" },
    )).toBe(false);
    expect(competitorSourceMatchesIdentity(
      "https://securelending.com.au",
      { url: "https://linkedin.com/company/secure-lending", platform: "linkedin" },
    )).toBe(true);
  });
});
