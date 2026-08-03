export type ProspectingSource = "google_maps" | "google_search" | "linkedin_profiles";

export interface NormalizedWebsiteEnrichment {
  websiteUrl: string;
  canonicalDomain: string;
  pageCount: number;
  pageUrls: string[];
  title: string | null;
  description: string | null;
  contentExcerpt: string | null;
  emails: string[];
  phones: string[];
  socialLinks: Record<string, string>;
  contentHash: string;
}

export type ProspectKind = "company" | "person";

export type ProspectingFieldSource = {
  source: ProspectingSource;
  actorId: string;
  actorBuildId: string | null;
  adapterVersion: number;
  providerRunId: string | null;
  capturedAt: string;
  sourceUrl: string | null;
};

export interface ProspectingSearchCriteria {
  queries: string[];
  locations: string[];
  maxResults: number;
  countryCode?: string;
  languageCode?: string;
  jobTitles?: string[];
  companyLinkedinUrls?: string[];
  recentlyPostedOnLinkedin?: boolean;
}

export interface NormalizedProspect {
  kind: ProspectKind;
  canonicalKey: string;
  dedupeKeys: string[];
  identitySignals: Array<{
    type: "google_place" | "domain" | "phone" | "name_address" | "linkedin" | "email" | "person_name_company";
    key: string;
    primary: boolean;
  }>;
  companyName: string | null;
  personName: string | null;
  jobTitle: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  sourceUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  locality: string | null;
  region: string | null;
  countryCode: string | null;
  industry: string | null;
  employeeCount: number | null;
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  source: ProspectingFieldSource;
  raw: Record<string, unknown>;
}

export interface ProspectingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProspectingNormalizationContext {
  providerRunId?: string | null;
  actorBuildId?: string | null;
  capturedAt?: string;
}

export interface ProspectingActorAdapter {
  readonly source: ProspectingSource;
  readonly actorId: string;
  /** Immutable Apify Actor id returned as `actId` on every run. */
  readonly providerActorId: string;
  /** Exact tested Actor build number. Never use a moving tag in production. */
  readonly build: string;
  readonly version: number;
  readonly supportedKinds: ProspectKind[];
  validate(criteria: ProspectingSearchCriteria): ProspectingValidationResult;
  buildInput(criteria: ProspectingSearchCriteria): Record<string, unknown>;
  normalize(
    value: unknown,
    context: ProspectingNormalizationContext,
  ): NormalizedProspect[];
}

export type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMING-OUT"
  | "TIMED-OUT"
  | "ABORTING"
  | "ABORTED";

export interface ApifyActorRun {
  id: string;
  actId: string;
  status: ApifyRunStatus;
  defaultDatasetId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  buildId: string | null;
  usageTotalUsd: number | null;
}

export interface StartApifyActorRunOptions {
  actorId: string;
  input: Record<string, unknown>;
  maxItems: number;
  maxTotalChargeUsd: number;
  build?: string;
  webhookUrl?: string;
  webhookIdempotencyKey?: string;
}
