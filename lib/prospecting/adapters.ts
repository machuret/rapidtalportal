import type {
  NormalizedProspect,
  ProspectingActorAdapter,
  ProspectingNormalizationContext,
  ProspectingSearchCriteria,
  ProspectingValidationResult,
} from "@/lib/prospecting/types";
import {
  asRecord,
  canonicalLinkedinUrl,
  canonicalWebsiteDomain,
  cleanEmail,
  cleanInteger,
  cleanNumber,
  cleanPhone,
  cleanString,
  cleanUrl,
  deduplicateProspects,
  firstEmail,
  firstValue,
  makeCanonicalKey,
  sourceMetadata,
} from "@/lib/prospecting/normalization";

const GOOGLE_MAPS_ACTOR = "compass~crawler-google-places";
const GOOGLE_SEARCH_ACTOR = "apify~google-search-scraper";
const LINKEDIN_PROFILE_ACTOR = "harvestapi~linkedin-profile-search";

function baseValidation(criteria: ProspectingSearchCriteria): ProspectingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!criteria.queries.length) errors.push("Add at least one search term.");
  if (criteria.queries.length > 10) errors.push("Use no more than 10 search terms per run.");
  if (criteria.queries.some((query) => query.trim().length < 2 || query.length > 300)) {
    errors.push("Each search term must contain 2 to 300 characters.");
  }
  if (!Number.isInteger(criteria.maxResults) || criteria.maxResults < 1 || criteria.maxResults > 500) {
    errors.push("Maximum results must be between 1 and 500.");
  }
  if (criteria.maxResults > 100) warnings.push("Large runs should require an explicit budget confirmation.");
  return { valid: errors.length === 0, errors, warnings };
}

function emptyProspect(
  overrides: Partial<NormalizedProspect> & Pick<NormalizedProspect, "kind" | "canonicalKey" | "source" | "raw">,
): NormalizedProspect {
  return {
    companyName: null,
    personName: null,
    jobTitle: null,
    websiteUrl: null,
    linkedinUrl: null,
    sourceUrl: null,
    email: null,
    phone: null,
    address: null,
    locality: null,
    region: null,
    countryCode: null,
    industry: null,
    employeeCount: null,
    rating: null,
    reviewCount: null,
    latitude: null,
    longitude: null,
    description: null,
    dedupeKeys: [overrides.canonicalKey],
    ...overrides,
  };
}

const googleMapsAdapter: ProspectingActorAdapter = {
  source: "google_maps",
  actorId: GOOGLE_MAPS_ACTOR,
  version: 1,
  supportedKinds: ["company"],
  validate(criteria) {
    const result = baseValidation(criteria);
    if (criteria.locations.length !== 1) {
      result.errors.push("Google Maps discovery requires exactly one location per run.");
    }
    result.valid = result.errors.length === 0;
    return result;
  },
  buildInput(criteria) {
    return {
      searchStringsArray: criteria.queries.map((query) => query.trim()),
      locationQuery: criteria.locations[0]?.trim(),
      maxCrawledPlacesPerSearch: Math.max(1, Math.ceil(criteria.maxResults / criteria.queries.length)),
      language: criteria.languageCode ?? "en",
      skipClosedPlaces: true,
      scrapeDirectories: false,
      maxReviews: 0,
      scrapeImageAuthors: false,
    };
  },
  normalize(value, context) {
    const row = asRecord(value);
    if (!row) return [];
    const companyName = cleanString(firstValue(row, ["title", "name"]), 300);
    const websiteUrl = cleanUrl(firstValue(row, ["website", "websiteUrl"]));
    const sourceUrl = cleanUrl(firstValue(row, ["url", "googleMapsUrl"]));
    const placeId = cleanString(firstValue(row, ["placeId", "place_id", "cid"]), 300);
    if (!companyName && !websiteUrl && !placeId) return [];
    const location = asRecord(row.location);
    const email = firstEmail(row.emails) ?? cleanEmail(row.email);
    const domain = canonicalWebsiteDomain(websiteUrl);
    const phone = cleanPhone(firstValue(row, ["phoneUnformatted", "phone"]));
    const address = cleanString(firstValue(row, ["address", "street"]), 500);
    const fallbackKey = companyName
      ? makeCanonicalKey(["company_name_address", companyName, address])
      : null;
    const dedupeKeys = [
      placeId ? makeCanonicalKey(["google_place", placeId]) : null,
      domain ? makeCanonicalKey(["domain", domain]) : null,
      phone ? makeCanonicalKey(["phone", phone.replace(/\D/gu, "")]) : null,
      fallbackKey,
    ].filter((key): key is string => Boolean(key));
    return [emptyProspect({
      kind: "company",
      canonicalKey: dedupeKeys[0],
      dedupeKeys,
      companyName,
      websiteUrl,
      sourceUrl,
      email,
      phone,
      address,
      locality: cleanString(firstValue(row, ["city", "neighborhood"]), 200),
      region: cleanString(firstValue(row, ["state", "region"]), 200),
      countryCode: cleanString(firstValue(row, ["countryCode", "country"]), 3)?.toUpperCase() ?? null,
      industry: cleanString(firstValue(row, ["categoryName", "category"]), 300),
      rating: cleanNumber(firstValue(row, ["totalScore", "rating"])),
      reviewCount: cleanInteger(firstValue(row, ["reviewsCount", "reviewCount"])),
      latitude: cleanNumber(location?.lat ?? row.latitude),
      longitude: cleanNumber(location?.lng ?? row.longitude),
      description: cleanString(firstValue(row, ["description", "about"]), 5_000),
      source: sourceMetadata("google_maps", GOOGLE_MAPS_ACTOR, 1, sourceUrl, context),
      raw: row,
    })];
  },
};

function normalizeOrganicResult(
  value: unknown,
  context: ProspectingNormalizationContext,
): NormalizedProspect[] {
  const row = asRecord(value);
  if (!row) return [];
  const sourceUrl = cleanUrl(firstValue(row, ["url", "link"]));
  if (!sourceUrl) return [];
  const domain = canonicalWebsiteDomain(sourceUrl);
  const title = cleanString(row.title, 500);
  if (!domain) return [];
  const domainKey = makeCanonicalKey(["domain", domain]);
  return [emptyProspect({
    kind: "company",
    canonicalKey: domainKey,
    dedupeKeys: [domainKey],
    companyName: title,
    websiteUrl: sourceUrl,
    sourceUrl,
    description: cleanString(firstValue(row, ["description", "snippet"]), 5_000),
    source: sourceMetadata("google_search", GOOGLE_SEARCH_ACTOR, 1, sourceUrl, context),
    raw: row,
  })];
}

const googleSearchAdapter: ProspectingActorAdapter = {
  source: "google_search",
  actorId: GOOGLE_SEARCH_ACTOR,
  version: 1,
  supportedKinds: ["company"],
  validate: baseValidation,
  buildInput(criteria) {
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
  },
  normalize(value, context) {
    const row = asRecord(value);
    if (!row) return [];
    const organic = Array.isArray(row.organicResults) ? row.organicResults : [row];
    return deduplicateProspects(organic.flatMap((item) => normalizeOrganicResult(item, context)));
  },
};

const linkedinProfilesAdapter: ProspectingActorAdapter = {
  source: "linkedin_profiles",
  actorId: LINKEDIN_PROFILE_ACTOR,
  version: 1,
  supportedKinds: ["person"],
  validate(criteria) {
    const result = baseValidation(criteria);
    if (!criteria.locations.length && !criteria.companyLinkedinUrls?.length) {
      result.warnings.push("A location or current company filter will make LinkedIn results more precise.");
    }
    if (criteria.maxResults > 100) {
      result.errors.push("LinkedIn discovery is capped at 100 people per run during the pilot.");
    }
    result.valid = result.errors.length === 0;
    return result;
  },
  buildInput(criteria) {
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
  },
  normalize(value, context) {
    const row = asRecord(value);
    if (!row) return [];
    const linkedinUrl = canonicalLinkedinUrl(firstValue(row, ["linkedinUrl", "profileUrl", "url"]));
    const firstName = cleanString(row.firstName, 150);
    const lastName = cleanString(row.lastName, 150);
    const personName = cleanString(firstValue(row, ["fullName", "name"]), 300)
      ?? ([firstName, lastName].filter(Boolean).join(" ") || null);
    const currentPositions = Array.isArray(row.currentPositions) ? row.currentPositions : [];
    const currentPosition = asRecord(currentPositions[0])
      ?? asRecord(firstValue(row, ["currentPosition", "position"]));
    const companyName = cleanString(
      firstValue(row, ["companyName", "currentCompanyName"])
        ?? firstValue(currentPosition ?? {}, ["companyName", "company"]),
      300,
    );
    const email = firstEmail(row.emails) ?? cleanEmail(row.email);
    if (!linkedinUrl && !personName && !email) return [];
    const fallbackKey = personName
      ? makeCanonicalKey(["person_name_company", personName, companyName])
      : null;
    const dedupeKeys = [
      linkedinUrl ? makeCanonicalKey(["linkedin", linkedinUrl]) : null,
      email ? makeCanonicalKey(["email", email]) : null,
      fallbackKey,
    ].filter((key): key is string => Boolean(key));
    return [emptyProspect({
      kind: "person",
      canonicalKey: dedupeKeys[0],
      dedupeKeys,
      personName,
      companyName,
      jobTitle: cleanString(
        firstValue(currentPosition ?? {}, ["title", "jobTitle"])
          ?? firstValue(row, ["headline", "jobTitle", "currentJobTitle", "summary"]),
        500,
      ),
      linkedinUrl,
      sourceUrl: linkedinUrl,
      email,
      locality: cleanString(firstValue(row, ["location", "city"]), 300),
      industry: cleanString(row.industry, 300),
      description: cleanString(firstValue(row, ["about", "summary"]), 5_000),
      source: sourceMetadata("linkedin_profiles", LINKEDIN_PROFILE_ACTOR, 1, linkedinUrl, context),
      raw: row,
    })];
  },
};

const adapters: ProspectingActorAdapter[] = [
  googleMapsAdapter,
  googleSearchAdapter,
  linkedinProfilesAdapter,
];

export const prospectingActorRegistry = Object.freeze(
  Object.fromEntries(adapters.map((adapter) => [adapter.source, adapter])) as Record<
    ProspectingActorAdapter["source"],
    ProspectingActorAdapter
  >,
);

export function getProspectingAdapter(source: ProspectingActorAdapter["source"]): ProspectingActorAdapter {
  return prospectingActorRegistry[source];
}

export function normalizeProspectingDataset(
  source: ProspectingActorAdapter["source"],
  values: unknown[],
  context: ProspectingNormalizationContext,
  maxResults: number,
): NormalizedProspect[] {
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 500) return [];
  const adapter = getProspectingAdapter(source);
  return deduplicateProspects(values.flatMap((value) => adapter.normalize(value, context)))
    .slice(0, maxResults);
}
