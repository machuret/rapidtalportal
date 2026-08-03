import { DISCOVERY_SOURCE_CATALOG } from "@/lib/prospecting/catalog";
import {
  asRecord,
  canonicalWebsiteDomain,
  cleanString,
  cleanUrl,
  deduplicateProspects,
  firstValue,
  makeCanonicalKey,
  sourceMetadata,
} from "@/lib/prospecting/normalization";
import { providerInputBuilders } from "@/lib/prospecting/provider-inputs.mjs";
import { createEmptyProspect, validateProspectingCriteria } from "@/lib/prospecting/providers/shared";
import type {
  NormalizedProspect,
  ProspectingActorAdapter,
  ProspectingNormalizationContext,
} from "@/lib/prospecting/types";

const PROVIDER = DISCOVERY_SOURCE_CATALOG.google_search;
const NON_COMPANY_SEARCH_DOMAINS = [
  "facebook.com", "instagram.com", "linkedin.com", "youtube.com", "wikipedia.org",
  "yelp.com", "yellowpages.com.au", "truelocal.com.au", "hipages.com.au",
  "zoominfo.com", "crunchbase.com",
];

function isCompanyWebsiteDomain(domain: string): boolean {
  return !NON_COMPANY_SEARCH_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

function normalizeOrganicResult(
  value: unknown,
  context: ProspectingNormalizationContext,
): NormalizedProspect[] {
  const row = asRecord(value);
  if (!row) return [];
  const sourceUrl = cleanUrl(firstValue(row, ["url", "link"]));
  if (!sourceUrl) return [];
  const domain = canonicalWebsiteDomain(sourceUrl);
  if (!domain || !isCompanyWebsiteDomain(domain)) return [];
  const domainKey = makeCanonicalKey(["domain", domain]);
  return [createEmptyProspect({
    kind: "company",
    canonicalKey: domainKey,
    dedupeKeys: [domainKey],
    identitySignals: [{ type: "domain", key: domainKey, primary: true }],
    companyName: cleanString(row.title, 500),
    websiteUrl: sourceUrl,
    sourceUrl,
    description: cleanString(firstValue(row, ["description", "snippet"]), 5_000),
    source: sourceMetadata("google_search", PROVIDER.actorId, PROVIDER.adapterVersion, sourceUrl, context),
    raw: row,
  })];
}

export const googleSearchAdapter: ProspectingActorAdapter = {
  source: "google_search",
  actorId: PROVIDER.actorId,
  providerActorId: PROVIDER.providerActorId,
  build: PROVIDER.build,
  version: PROVIDER.adapterVersion,
  supportedKinds: ["company"],
  validate: validateProspectingCriteria,
  buildInput: providerInputBuilders.google_search,
  normalize(value, context) {
    const row = asRecord(value);
    if (!row) return [];
    const organic = Array.isArray(row.organicResults) ? row.organicResults : [row];
    return deduplicateProspects(organic.flatMap((item) => normalizeOrganicResult(item, context)));
  },
};
