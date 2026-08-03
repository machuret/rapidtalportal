import googleMapsFixture from "@/__tests__/fixtures/prospecting/google-maps.json";
import googleSearchFixture from "@/__tests__/fixtures/prospecting/google-search.json";
import linkedinFixture from "@/__tests__/fixtures/prospecting/linkedin-profile.json";
import {
  getProspectingAdapter,
  normalizeProspectingDataset,
  prospectingActorRegistry,
} from "@/lib/prospecting/adapters";
import type { ProspectingSearchCriteria } from "@/lib/prospecting/types";

const baseCriteria: ProspectingSearchCriteria = {
  queries: ["mortgage broker"],
  locations: ["Sydney, Australia"],
  maxResults: 10,
  countryCode: "au",
  languageCode: "en",
};

describe("prospecting Actor adapters", () => {
  test("registers only approved Phase 0 providers", () => {
    expect(Object.keys(prospectingActorRegistry)).toEqual([
      "google_maps",
      "google_search",
      "linkedin_profiles",
    ]);
    expect(prospectingActorRegistry.google_maps.actorId).toBe("compass~crawler-google-places");
  });

  test("builds a cost-bounded Google Maps input and validates location cardinality", () => {
    const adapter = getProspectingAdapter("google_maps");
    expect(adapter.validate(baseCriteria)).toEqual({ valid: true, errors: [], warnings: [] });
    expect(adapter.buildInput(baseCriteria)).toEqual(expect.objectContaining({
      searchStringsArray: ["mortgage broker"],
      locationQuery: "Sydney, Australia",
      maxCrawledPlacesPerSearch: 10,
      maxReviews: 0,
      skipClosedPlaces: true,
    }));
    expect(adapter.validate({ ...baseCriteria, locations: [] })).toEqual(expect.objectContaining({
      valid: false,
      errors: ["Google Maps discovery requires exactly one location per run."],
    }));
  });

  test("normalizes Google Maps companies with stable provenance", () => {
    const [lead] = getProspectingAdapter("google_maps").normalize(googleMapsFixture, {
      providerRunId: "run-maps-1",
      actorBuildId: "build-maps-1",
      capturedAt: "2026-08-03T00:00:00.000Z",
    });
    expect(lead).toEqual(expect.objectContaining({
      kind: "company",
      companyName: "Harbour Finance Brokers",
      websiteUrl: "https://www.harbour-finance.example",
      phone: "+61290001111",
      locality: "Sydney",
      region: "New South Wales",
      countryCode: "AU",
      rating: 4.8,
      reviewCount: 87,
    }));
    expect(lead.canonicalKey).toHaveLength(64);
    expect(lead.dedupeKeys).toEqual([lead.canonicalKey]);
    expect(lead.source).toEqual({
      source: "google_maps",
      actorId: "compass~crawler-google-places",
      actorBuildId: "build-maps-1",
      adapterVersion: 1,
      providerRunId: "run-maps-1",
      capturedAt: "2026-08-03T00:00:00.000Z",
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJ-test-maps-place",
    });
  });

  test("does not collapse distinct Google places that share a corporate website and phone", () => {
    const shared = {
      title: "National Finance",
      website: "https://national-finance.example",
      phone: "+61290000000",
    };
    const rows = normalizeProspectingDataset("google_maps", [
      { ...shared, placeId: "sydney-branch", address: "1 Sydney Street" },
      { ...shared, placeId: "parramatta-branch", address: "2 Parramatta Road" },
    ], { providerRunId: "run-shared-domain" }, 10);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.canonicalKey)).size).toBe(2);
  });

  test("flattens and deduplicates Google organic results by company domain", () => {
    const rows = getProspectingAdapter("google_search").normalize(googleSearchFixture, {
      providerRunId: "run-search-1",
      capturedAt: "2026-08-03T00:00:00.000Z",
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.companyName)).toEqual([
      "Harbour Commercial Finance",
      "Northern Business Loans",
    ]);
    expect(getProspectingAdapter("google_search").buildInput(baseCriteria)).toEqual(expect.objectContaining({
      queries: "mortgage broker Sydney, Australia",
      maxPagesPerQuery: 1,
      countryCode: "au",
      saveHtml: false,
    }));
  });

  test("filters social networks and business directories from web-company discovery", () => {
    const rows = getProspectingAdapter("google_search").normalize({
      organicResults: [
        { title: "Directory result", url: "https://www.yellowpages.com.au/find/mortgage-brokers" },
        { title: "Social result", url: "https://www.linkedin.com/company/example" },
        { title: "Actual company", url: "https://actual-company.example/about" },
      ],
    }, { providerRunId: "run-search-quality" });
    expect(rows).toHaveLength(1);
    expect(rows[0].companyName).toBe("Actual company");
  });

  test("enforces the requested maximum after nested provider results are normalized", () => {
    const rows = normalizeProspectingDataset(
      "google_search",
      [googleSearchFixture],
      { providerRunId: "run-search-limit" },
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].companyName).toBe("Harbour Commercial Finance");
  });

  test("normalizes LinkedIn people without requesting email enrichment", () => {
    const adapter = getProspectingAdapter("linkedin_profiles");
    const input = adapter.buildInput({
      ...baseCriteria,
      queries: ["Finance Director"],
      jobTitles: ["Finance Director"],
      recentlyPostedOnLinkedin: true,
    });
    expect(input).toEqual(expect.objectContaining({
      profileScraperMode: "Short",
      maxItems: 10,
      takePages: 1,
      autoQuerySegmentation: false,
      profileDeduplicationMode: "off",
    }));
    const [lead] = adapter.normalize(linkedinFixture, {
      providerRunId: "run-linkedin-1",
      capturedAt: "2026-08-03T00:00:00.000Z",
    });
    expect(lead).toEqual(expect.objectContaining({
      kind: "person",
      personName: "Alex Morgan",
      companyName: "Harbour Manufacturing",
      jobTitle: "Finance Director",
      linkedinUrl: "https://www.linkedin.com/in/alex-morgan-test",
      locality: "Sydney, New South Wales, Australia",
      email: null,
      description: "Finance leader focused on sustainable manufacturing growth.",
    }));
  });

  test("rejects unbounded or malformed search criteria", () => {
    const result = getProspectingAdapter("linkedin_profiles").validate({
      queries: [],
      locations: [],
      maxResults: 501,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "Add at least one search term.",
      "Maximum results must be between 1 and 500.",
      "LinkedIn discovery is capped at 100 people per run during the pilot.",
    ]));
  });
});
