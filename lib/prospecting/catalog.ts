import providers from "@/lib/prospecting/providers.json";

/**
 * Product-facing discovery capabilities. API validation and the campaign UI
 * consume this same catalogue so enabling a tested discovery source does not
 * require duplicating its label and supported qualification fields.
 */
export const ENABLED_DISCOVERY_SOURCES = ["google_maps", "google_search"] as const;
export type EnabledDiscoverySource = typeof ENABLED_DISCOVERY_SOURCES[number];

export const DISCOVERY_SOURCE_CATALOG: Record<EnabledDiscoverySource, {
  label: string;
  description: string;
  supportsRatings: boolean;
  supportsReviewCounts: boolean;
  actorId: string;
  providerActorId: string;
  build: string;
  adapterVersion: number;
}> = {
  google_maps: providers.google_maps,
  google_search: providers.google_search,
};

export function discoverySourceCapabilities(source: EnabledDiscoverySource) {
  return DISCOVERY_SOURCE_CATALOG[source];
}
