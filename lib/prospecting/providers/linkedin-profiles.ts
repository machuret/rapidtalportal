import {
  asRecord,
  canonicalLinkedinUrl,
  cleanEmail,
  cleanString,
  firstEmail,
  firstValue,
  makeCanonicalKey,
  sourceMetadata,
} from "@/lib/prospecting/normalization";
import { providerInputBuilders } from "@/lib/prospecting/provider-inputs.mjs";
import providers from "@/lib/prospecting/providers.json";
import { createEmptyProspect, validateProspectingCriteria } from "@/lib/prospecting/providers/shared";
import type { ProspectingActorAdapter } from "@/lib/prospecting/types";

const PROVIDER = providers.linkedin_profiles;

export const linkedinProfilesAdapter: ProspectingActorAdapter = {
  source: "linkedin_profiles",
  actorId: PROVIDER.actorId,
  providerActorId: PROVIDER.providerActorId,
  build: PROVIDER.build,
  version: PROVIDER.adapterVersion,
  supportedKinds: ["person"],
  validate(criteria) {
    const result = validateProspectingCriteria(criteria);
    if (!criteria.locations.length && !criteria.companyLinkedinUrls?.length) {
      result.warnings.push("A location or current company filter will make LinkedIn results more precise.");
    }
    if (criteria.maxResults > 100) {
      result.errors.push("LinkedIn discovery is capped at 100 people per run during the pilot.");
    }
    result.valid = result.errors.length === 0;
    return result;
  },
  buildInput: providerInputBuilders.linkedin_profiles,
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
    const linkedinKey = linkedinUrl ? makeCanonicalKey(["linkedin", linkedinUrl]) : null;
    const emailKey = email ? makeCanonicalKey(["email", email]) : null;
    const fallbackKey = personName ? makeCanonicalKey(["person_name_company", personName, companyName]) : null;
    const dedupeKeys = [linkedinKey, emailKey, fallbackKey]
      .filter((key): key is string => Boolean(key));
    const canonicalKey = dedupeKeys[0];
    return [createEmptyProspect({
      kind: "person",
      canonicalKey,
      dedupeKeys,
      identitySignals: [
        linkedinKey ? { type: "linkedin" as const, key: linkedinKey, primary: canonicalKey === linkedinKey } : null,
        emailKey ? { type: "email" as const, key: emailKey, primary: canonicalKey === emailKey } : null,
        fallbackKey ? { type: "person_name_company" as const, key: fallbackKey, primary: canonicalKey === fallbackKey } : null,
      ].filter((signal): signal is NonNullable<typeof signal> => Boolean(signal)),
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
      source: sourceMetadata("linkedin_profiles", PROVIDER.actorId, PROVIDER.adapterVersion, linkedinUrl, context),
      raw: row,
    })];
  },
};
