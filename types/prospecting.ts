import type { ProspectingSource } from "@/lib/prospecting/types";

export type ProspectingCampaignStatus = "ready" | "running" | "completed" | "failed" | "archived";
export type ProspectingJobStatus = "queued" | "running" | "ingesting" | "done" | "error" | "cancelled";
export type ProspectingLeadStatus = "new" | "shortlisted" | "dismissed" | "imported";

export interface ProspectingIdealProfile {
  requiredKeywords: string[];
  preferredKeywords: string[];
  excludedKeywords: string[];
  minRating: number;
  minReviewCount: number;
  mustHaveWebsite: boolean;
}

export interface ProspectingCampaign {
  id: string;
  client_id: string;
  name: string;
  source: Extract<ProspectingSource, "google_maps" | "google_search">;
  queries: string[];
  locations: string[];
  country_code: string;
  language_code: string;
  max_results: number;
  ideal_profile: ProspectingIdealProfile | Record<string, never>;
  status: ProspectingCampaignStatus;
  last_job_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  latest_job?: ProspectingJob | null;
}

export interface ProspectingJob {
  id: string;
  campaign_id: string;
  client_id: string;
  source: ProspectingCampaign["source"] | "website_enrichment";
  job_type: "collection" | "enrichment";
  lead_id: string | null;
  prospect_id: string | null;
  status: ProspectingJobStatus;
  provider_status: string | null;
  actor_id: string;
  actor_build_id: string | null;
  actor_run_id: string | null;
  actor_dataset_id: string | null;
  adapter_version: number;
  requested_results: number;
  returned_results: number;
  created_results: number;
  deduplicated_results: number;
  max_charge_usd: number;
  usage_total_usd: number | null;
  usage_date: string;
  error_code: string | null;
  error_message: string | null;
  failure_count: number;
  next_attempt_at: string | null;
  provider_confirmation_deadline: string | null;
  reservation_released_at: string | null;
  cancel_requested_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ProspectingLead {
  id: string;
  campaign_id: string;
  job_id: string;
  client_id: string;
  status: ProspectingLeadStatus;
  crm_contact_id: string | null;
  discovered_at: string;
  last_seen_at: string;
  fit_score: number | null;
  fit_band: "strong" | "possible" | "weak" | null;
  fit_breakdown: {
    dimensions?: Record<string, { score: number; maximum: number }>;
    criteria?: Record<string, number | boolean>;
    explanation?: string;
  };
  score_version: string | null;
  scored_at: string | null;
  latest_enrichment_id: string | null;
  latest_enrichment: ProspectingEnrichmentSnapshot | null;
  active_enrichment_job: ProspectingJob | null;
  prospect: {
    id: string;
    kind: "company" | "person";
    company_name: string | null;
    person_name: string | null;
    job_title: string | null;
    website_url: string | null;
    linkedin_url: string | null;
    source_url: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    locality: string | null;
    region: string | null;
    country_code: string | null;
    industry: string | null;
    rating: number | null;
    review_count: number | null;
    description: string | null;
    source: ProspectingSource;
    last_seen_at: string;
  };
  campaign: { id: string; name: string; source: ProspectingCampaign["source"] };
}

export interface ProspectingEnrichmentSnapshot {
  id: string;
  website_url: string;
  canonical_domain: string;
  page_count: number;
  page_urls: string[];
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  social_links: Record<string, string>;
  captured_at: string;
}

export interface ProspectingLeadPage {
  leads: ProspectingLead[];
  total: number;
  offset: number;
  limit: number;
}

export interface ProspectingCampaignPage {
  campaigns: ProspectingCampaign[];
  total: number;
  offset: number;
  limit: number;
  usage: {
    runs_started: number;
    results_reserved: number;
    results_returned: number;
    reported_cost_usd: number;
    enrichments_started: number;
    enrichment_pages: number;
  };
}
