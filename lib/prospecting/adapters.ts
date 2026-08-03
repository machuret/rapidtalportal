import { deduplicateProspects } from "@/lib/prospecting/normalization";
import { googleMapsAdapter } from "@/lib/prospecting/providers/google-maps";
import { googleSearchAdapter } from "@/lib/prospecting/providers/google-search";
import { linkedinProfilesAdapter } from "@/lib/prospecting/providers/linkedin-profiles";
import type {
  NormalizedProspect,
  ProspectingActorAdapter,
  ProspectingNormalizationContext,
} from "@/lib/prospecting/types";

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
