export type CompetitorStatus = "active" | "paused";
export type CompetitorRefreshCadence = "manual" | "daily" | "weekly" | "monthly";
export type CompetitorSourceType =
  | "website"
  | "blog"
  | "page"
  | "sitemap"
  | "rss"
  | "newsletter_archive"
  | "youtube"
  | "social_profile"
  | "other";
export type CompetitorPlatform =
  | "web"
  | "rss"
  | "newsletter"
  | "youtube"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "x"
  | "other";
export type CompetitorCrawlScope = "exact" | "path" | "domain" | "sitemap" | "feed" | "profile";
export type CompetitorSourceStatus = "active" | "paused" | "retrying" | "error" | "connector_required";
export type CompetitorCrawlStatus = "queued" | "crawling" | "ingesting" | "done" | "error" | "cancelled";

export interface CompetitorSource {
  id: string;
  competitor_id: string;
  client_id: string;
  source_type: CompetitorSourceType;
  platform: CompetitorPlatform;
  url: string;
  normalized_url: string;
  crawl_scope: CompetitorCrawlScope;
  path_prefix: string | null;
  status: CompetitorSourceStatus;
  refresh_cadence: CompetitorRefreshCadence | null;
  max_pages: number;
  content_count: number;
  last_crawled_at: string | null;
  last_success_at: string | null;
  next_refresh_at: string | null;
  last_error: string | null;
  failure_count?: number;
  created_at: string;
  latest_job?: CompetitorCrawlJob | null;
}

export interface CompetitorCrawlJob {
  id: string;
  source_id: string;
  competitor_id: string;
  client_id: string;
  status: CompetitorCrawlStatus;
  provider?: string;
  provider_job_id?: string | null;
  next_result_url?: string | null;
  provider_complete?: boolean;
  cancel_requested_at?: string | null;
  pages_discovered: number;
  items_captured: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CompetitorContentItem {
  id: string;
  source_id: string;
  competitor_id: string;
  canonical_url: string;
  platform: string;
  content_type: string;
  title: string;
  published_at: string | null;
  captured_at: string;
  raw_content?: string;
  author?: string | null;
  metadata?: Record<string, unknown>;
  is_removed?: boolean;
}

export interface Competitor {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  status: CompetitorStatus;
  refresh_cadence: CompetitorRefreshCadence;
  created_at: string;
  updated_at: string;
  sources: CompetitorSource[];
  recent_items: CompetitorContentItem[];
}
