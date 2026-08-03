import { DISCOVERY_SOURCE_CATALOG } from "@/lib/prospecting/catalog";
import {
  asRecord,
  canonicalWebsiteDomain,
  cleanEmail,
  cleanInteger,
  cleanNumber,
  cleanPhone,
  cleanString,
  cleanUrl,
  firstEmail,
  firstValue,
  makeCanonicalKey,
  sourceMetadata,
} from "@/lib/prospecting/normalization";
import { providerInputBuilders } from "@/lib/prospecting/provider-inputs.mjs";
import { createEmptyProspect, validateProspectingCriteria } from "@/lib/prospecting/providers/shared";
import type { ProspectingActorAdapter } from "@/lib/prospecting/types";

const PROVIDER = DISCOVERY_SOURCE_CATALOG.google_maps;

export const googleMapsAdapter: ProspectingActorAdapter = {
  source: "google_maps",
  actorId: PROVIDER.actorId,
  providerActorId: PROVIDER.providerActorId,
  build: PROVIDER.build,
  version: PROVIDER.adapterVersion,
  supportedKinds: ["company"],
  validate(criteria) {
    const result = validateProspectingCriteria(criteria);
    if (criteria.locations.length !== 1) {
      result.errors.push("Google Maps discovery requires exactly one location per run.");
    }
    result.valid = result.errors.length === 0;
    return result;
  },
  buildInput: providerInputBuilders.google_maps,
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
    const fallbackKey = companyName ? makeCanonicalKey(["company_name_address", companyName, address]) : null;
    const placeKey = placeId ? makeCanonicalKey(["google_place", placeId]) : null;
    const domainKey = domain ? makeCanonicalKey(["domain", domain]) : null;
    const phoneKey = phone ? makeCanonicalKey(["phone", phone.replace(/\D/gu, "")]) : null;
    const dedupeKeys = [placeKey, domainKey, phoneKey, fallbackKey]
      .filter((key): key is string => Boolean(key));
    const canonicalKey = dedupeKeys[0];
    return [createEmptyProspect({
      kind: "company",
      canonicalKey,
      dedupeKeys,
      identitySignals: [
        placeKey ? { type: "google_place" as const, key: placeKey, primary: canonicalKey === placeKey } : null,
        domainKey ? { type: "domain" as const, key: domainKey, primary: canonicalKey === domainKey } : null,
        phoneKey ? { type: "phone" as const, key: phoneKey, primary: canonicalKey === phoneKey } : null,
        fallbackKey ? { type: "name_address" as const, key: fallbackKey, primary: canonicalKey === fallbackKey } : null,
      ].filter((signal): signal is NonNullable<typeof signal> => Boolean(signal)),
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
      source: sourceMetadata("google_maps", PROVIDER.actorId, PROVIDER.adapterVersion, sourceUrl, context),
      raw: row,
    })];
  },
};
