import type {
  NormalizedProspect,
  ProspectingSearchCriteria,
  ProspectingValidationResult,
} from "@/lib/prospecting/types";

export function validateProspectingCriteria(
  criteria: ProspectingSearchCriteria,
): ProspectingValidationResult {
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

export function createEmptyProspect(
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
    identitySignals: [],
    ...overrides,
  };
}
