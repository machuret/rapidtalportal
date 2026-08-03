// @ts-check

/**
 * Provider input contracts shared by the production adapters, live health
 * checks and the standalone Actor Lab. Keep this module dependency-light so
 * Node can execute the exact production builders without a TypeScript loader.
 */

/** @typedef {import("./types").ProspectingSearchCriteria} ProspectingSearchCriteria */

/** @param {ProspectingSearchCriteria} criteria */
function googleMaps(criteria) {
  // Free-text location polygons can resolve to a building or venue instead of
  // the intended city (for example Sydney resolving to Accor Stadium). Our
  // product cap is 100 results, below the Actor's 120-result single-map limit,
  // so a localized search term is both safer and more predictable.
  const location = criteria.locations[0]?.trim();
  return {
    searchStringsArray: criteria.queries.map((query) => (
      location ? `${query.trim()} ${location}` : query.trim()
    )),
    maxCrawledPlacesPerSearch: Math.max(1, Math.ceil(criteria.maxResults / criteria.queries.length)),
    language: criteria.languageCode ?? "en",
    skipClosedPlaces: true,
    searchMatching: "all",
    website: "allPlaces",
    includeWebResults: false,
    scrapeDirectories: false,
    scrapeContacts: false,
    scrapePlaceDetailPage: false,
    maxReviews: 0,
    maximumLeadsEnrichmentRecords: 0,
    scrapeImageAuthors: false,
    scrapeSocialMediaProfiles: {
      facebooks: false,
      instagrams: false,
      youtubes: false,
      tiktoks: false,
      twitters: false,
    },
  };
}

/** @param {ProspectingSearchCriteria} criteria */
function googleSearch(criteria) {
  const localizedQueries = criteria.queries.map((query) => {
    const location = criteria.locations[0]?.trim();
    return location ? `${query.trim()} ${location}` : query.trim();
  });
  return {
    queries: localizedQueries.join("\n"),
    maxPagesPerQuery: Math.max(1, Math.ceil(criteria.maxResults / (localizedQueries.length * 10))),
    resultsPerPage: 10,
    countryCode: (criteria.countryCode ?? "au").toLowerCase(),
    languageCode: criteria.languageCode ?? "en",
    mobileResults: false,
    includeUnfilteredResults: false,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
  };
}

/** @param {ProspectingSearchCriteria} criteria */
function linkedinProfiles(criteria) {
  return {
    profileScraperMode: "Short",
    searchQuery: criteria.queries.join(" OR "),
    maxItems: criteria.maxResults,
    takePages: Math.max(1, Math.ceil(criteria.maxResults / 25)),
    startPage: 1,
    locations: criteria.locations,
    currentJobTitles: criteria.jobTitles ?? [],
    currentCompanies: criteria.companyLinkedinUrls ?? [],
    recentlyPostedOnLinkedIn: criteria.recentlyPostedOnLinkedin ?? false,
    autoQuerySegmentation: false,
    profileDeduplicationMode: "off",
  };
}

/** @param {string} websiteUrl */
function websiteEnrichment(websiteUrl) {
  let url;
  try { url = new URL(websiteUrl); } catch { throw new Error("This lead has an invalid website URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("This lead has an invalid website URL.");
  url.hash = "";
  const host = url.hostname.toLowerCase();
  const baseHost = host.replace(/^www\./u, "");
  const allowedOrigins = [baseHost, `www.${baseHost}`].flatMap((allowedHost) => [
    `https://${allowedHost}`, `http://${allowedHost}`,
  ]);
  const priorityPaths = [
    "/about", "/about-us", "/company", "/who-we-are",
    "/services", "/solutions", "/products", "/what-we-do",
    "/contact", "/contact-us", "/get-in-touch",
  ];
  const priorityOrigins = [
    ...allowedOrigins,
    `https://*.${baseHost}`,
    `http://*.${baseHost}`,
  ];
  return {
    startUrls: [{ url: url.toString() }],
    // Lead enrichment needs a fast factual snapshot, not a browser-rendered
    // full-site crawl. Cheerio avoids minute-long client-side waits while the
    // targeted globs prevent product/blog pages consuming the five-page cap.
    crawlerType: "cheerio",
    maxCrawlDepth: 1,
    maxCrawlPages: 5,
    maxResults: 5,
    useSitemaps: false,
    includeUrlGlobs: priorityOrigins.flatMap((origin) => [
      origin,
      `${origin}/`,
      ...priorityPaths.flatMap((path) => [
        `${origin}${path}`,
        `${origin}${path}/`,
        `${origin}${path}?*`,
        `${origin}${path}/?*`,
      ]),
    ]),
    saveHtml: false,
    saveMarkdown: true,
    storeSkippedUrls: false,
    proxyConfiguration: { useApifyProxy: true },
  };
}

export const providerInputBuilders = Object.freeze({
  google_maps: googleMaps,
  google_search: googleSearch,
  linkedin_profiles: linkedinProfiles,
  website_enrichment: websiteEnrichment,
});
