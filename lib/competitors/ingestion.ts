import { createHash } from "node:crypto";
import {
  isCollectableLinkedinCompanyUrl,
  linkedinCompanySlug,
  nextRefreshAt,
  resolveCompetitorUrl,
} from "@/lib/competitors/urls";
import type {
  CompetitorCrawlJob,
  CompetitorRefreshCadence,
  CompetitorSource,
} from "@/types/competitors";

const FIRECRAWL_API = "https://api.firecrawl.dev/v2";
const FIRECRAWL_ORIGIN = new URL(FIRECRAWL_API).origin;
const INGEST_BATCH_SIZE = 10;
const EXCLUDED_PATHS = [
  "cart",
  "checkout",
  "account",
  "login",
  "register",
  "wishlist",
  "search",
];

// Supabase's generated schema is intentionally updated after migration deployment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export interface IngestionSource extends CompetitorSource {
  competitor_name?: string;
  competitor_cadence?: CompetitorRefreshCadence;
  competitor_status?: "active" | "paused";
  competitor_website_url?: string | null;
}

interface FirecrawlPage {
  markdown?: string;
  rawHtml?: string;
  links?: string[];
  metadata?: {
    sourceURL?: string;
    url?: string;
    canonicalUrl?: string;
    title?: string;
    author?: string;
    publishedTime?: string;
    statusCode?: number;
    [key: string]: unknown;
  };
}

interface FirecrawlResultPage {
  status: string;
  total: number;
  completed: number;
  pages: FirecrawlPage[];
  next: string | null;
}

interface ProviderStart {
  id: string;
  provider: "firecrawl_crawl" | "firecrawl_batch";
}

export class CompetitorIngestionError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = "CompetitorIngestionError";
  }
}

function firecrawlKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new CompetitorIngestionError("Competitor crawling is not configured.", 503);
  return key;
}

function configuredLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function firecrawlHeaders(includeContentType = false): Record<string, string> {
  return {
    Authorization: `Bearer ${firecrawlKey()}`,
    ...(includeContentType ? { "Content-Type": "application/json" } : {}),
  };
}

export function buildCompetitorCrawlRequest(source: IngestionSource) {
  const body: Record<string, unknown> = {
    url: source.url,
    limit: source.crawl_scope === "exact" ? 1 : source.max_pages,
    sitemap: source.crawl_scope === "sitemap" ? "only" : "include",
    excludePaths: EXCLUDED_PATHS,
    allowSubdomains: false,
    allowExternalLinks: false,
    crawlEntireDomain: source.crawl_scope === "domain",
    ignoreQueryParameters: true,
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 1500,
      timeout: 45000,
    },
  };

  if (source.crawl_scope === "exact") {
    body.sitemap = "skip";
    body.maxDiscoveryDepth = 0;
  } else if (source.crawl_scope === "path" && source.path_prefix) {
    const escaped = source.path_prefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\/+$/u, "");
    body.sitemap = "skip";
    body.includePaths = [`^${escaped}(?:/.*)?$`];
    body.maxDiscoveryDepth = 12;
  }
  return body;
}

async function firecrawlJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CompetitorIngestionError(
      json?.error ?? `Source collection returned ${response.status}`,
      response.status === 429 ? 429 : 502,
    );
  }
  return json;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;|&apos;/gu, "'");
}

function urlsFromXml(raw: string, links: unknown): string[] {
  const found = new Set<string>();
  for (const match of raw.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/giu)) {
    found.add(decodeXml(match[1].trim()));
  }
  for (const match of raw.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/giu)) {
    found.add(decodeXml(match[1].trim()));
  }
  for (const match of raw.matchAll(/<link\b[^>]*>(https?:\/\/[\s\S]*?)<\/link>/giu)) {
    found.add(decodeXml(match[1].trim()));
  }
  if (Array.isArray(links)) {
    for (const link of links) if (typeof link === "string") found.add(link);
  }
  return [...found];
}

function equivalentHost(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/^www\./u, "");
  const right = b.toLowerCase().replace(/^www\./u, "");
  return left === right;
}

function allowedSourceHost(candidate: URL, source: IngestionSource): boolean {
  const sourceUrl = new URL(source.normalized_url);
  if (equivalentHost(candidate.hostname, sourceUrl.hostname)) return true;
  if (source.competitor_website_url) {
    try {
      return equivalentHost(candidate.hostname, new URL(source.competitor_website_url).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

async function scrapeXml(url: string): Promise<{ raw: string; links: unknown }> {
  const json = await firecrawlJson(`${FIRECRAWL_API}/scrape`, {
    method: "POST",
    headers: firecrawlHeaders(true),
    body: JSON.stringify({
      url,
      formats: ["rawHtml", "links"],
      onlyMainContent: false,
      timeout: 45000,
    }),
  });
  return {
    raw: typeof json?.data?.rawHtml === "string" ? json.data.rawHtml : "",
    links: json?.data?.links,
  };
}

async function discoverDocumentUrls(source: IngestionSource): Promise<string[]> {
  const queue = [source.url];
  const visited = new Set<string>();
  const documents = new Set<string>();

  while (queue.length && visited.size < 12 && documents.size < source.max_pages) {
    const documentUrl = queue.shift()!;
    if (visited.has(documentUrl)) continue;
    visited.add(documentUrl);
    const { raw, links } = await scrapeXml(documentUrl);
    for (const candidateRaw of urlsFromXml(raw, links)) {
      try {
        const candidate = new URL(candidateRaw, documentUrl);
        if (candidate.protocol !== "https:" || !allowedSourceHost(candidate, source)) continue;
        const normalized = resolveCompetitorUrl(candidate.toString()).normalizedUrl;
        if (
          source.crawl_scope === "sitemap"
          && /(?:sitemap|sitemap_index)[^/]*\.xml(?:$|\?)/iu.test(candidate.toString())
        ) {
          if (!visited.has(normalized)) queue.push(normalized);
        } else {
          documents.add(normalized);
        }
      } catch {
        // Ignore malformed and non-public URLs supplied by the document.
      }
      if (documents.size >= source.max_pages) break;
    }
  }
  return [...documents];
}

function linkedinPostBelongsToCompany(raw: string, source: IngestionSource): boolean {
  const slug = linkedinCompanySlug(source.normalized_url);
  if (!slug) return false;
  try {
    const candidate = new URL(raw);
    const host = candidate.hostname.toLowerCase().replace(/^www\./u, "");
    return candidate.protocol === "https:"
      && (host === "linkedin.com" || host.endsWith(".linkedin.com"))
      && candidate.pathname.toLowerCase().startsWith(`/posts/${slug}_`);
  } catch {
    return false;
  }
}

async function discoverLinkedinPostUrls(source: IngestionSource): Promise<string[]> {
  const slug = linkedinCompanySlug(source.normalized_url);
  if (!slug) {
    throw new CompetitorIngestionError(
      "Use a public LinkedIn company page URL, for example https://www.linkedin.com/company/company-name.",
      422,
    );
  }
  const name = source.competitor_name?.trim() || slug.replace(/-/gu, " ");
  const json = await firecrawlJson(`${FIRECRAWL_API}/search`, {
    method: "POST",
    headers: firecrawlHeaders(true),
    body: JSON.stringify({
      query: `site:linkedin.com/posts/${slug} "${name}"`,
      limit: source.max_pages,
      sources: ["web"],
      includeDomains: ["linkedin.com"],
      timeout: 45000,
    }),
  });
  const results = Array.isArray(json?.data?.web) ? json.data.web : [];
  return [...new Set<string>(results
    .map((result: { url?: unknown }) => typeof result?.url === "string" ? result.url : "")
    .filter((url: string) => linkedinPostBelongsToCompany(url, source)))]
    .slice(0, source.max_pages);
}

async function startFirecrawl(source: IngestionSource): Promise<ProviderStart> {
  let endpoint = `${FIRECRAWL_API}/crawl`;
  let body: Record<string, unknown> = buildCompetitorCrawlRequest(source);
  let provider: ProviderStart["provider"] = "firecrawl_crawl";

  if (
    source.platform === "linkedin"
    && source.source_type === "social_profile"
    && isCollectableLinkedinCompanyUrl(source.normalized_url)
  ) {
    const urls = await discoverLinkedinPostUrls(source);
    if (urls.length === 0) {
      throw new CompetitorIngestionError(
        "No public posts were found for this LinkedIn company page. Check the URL or add public post URLs individually.",
        422,
      );
    }
    endpoint = `${FIRECRAWL_API}/batch/scrape`;
    body = {
      urls,
      formats: ["markdown"],
      onlyMainContent: true,
      ignoreInvalidURLs: true,
      maxConcurrency: 5,
      timeout: 45000,
    };
    provider = "firecrawl_batch";
  } else if (source.crawl_scope === "feed" || source.crawl_scope === "sitemap") {
    const urls = await discoverDocumentUrls(source);
    if (urls.length === 0) {
      throw new CompetitorIngestionError("The supplied sitemap or feed did not contain public content URLs.", 422);
    }
    endpoint = `${FIRECRAWL_API}/batch/scrape`;
    body = {
      urls: urls.slice(0, source.max_pages),
      formats: ["markdown"],
      onlyMainContent: true,
      ignoreInvalidURLs: true,
      maxConcurrency: 5,
      timeout: 45000,
    };
    provider = "firecrawl_batch";
  } else if (source.crawl_scope === "exact") {
    endpoint = `${FIRECRAWL_API}/batch/scrape`;
    body = {
      urls: [source.url],
      formats: ["markdown"],
      onlyMainContent: true,
      ignoreInvalidURLs: false,
      maxConcurrency: 1,
      timeout: 45000,
    };
    provider = "firecrawl_batch";
  }

  const json = await firecrawlJson(endpoint, {
    method: "POST",
    headers: firecrawlHeaders(true),
    body: JSON.stringify(body),
  });
  if (typeof json?.id !== "string") {
    throw new CompetitorIngestionError("The collection provider did not return a job identifier.", 502);
  }
  return { id: json.id, provider };
}

function verifiedResultUrl(raw: string): string {
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:"
    || parsed.origin !== FIRECRAWL_ORIGIN
    || !parsed.pathname.startsWith("/v2/")
  ) {
    throw new CompetitorIngestionError("The collection provider returned an unsafe continuation URL.", 502);
  }
  return parsed.toString();
}

async function fetchFirecrawlResult(
  providerJobId: string,
  provider: string,
  continuation: string | null,
): Promise<FirecrawlResultPage> {
  const initialPath = provider === "firecrawl_batch"
    ? `/batch/scrape/${encodeURIComponent(providerJobId)}`
    : `/crawl/${encodeURIComponent(providerJobId)}`;
  const url = continuation
    ? verifiedResultUrl(continuation)
    : `${FIRECRAWL_API}${initialPath}`;
  const json = await firecrawlJson(url, { headers: firecrawlHeaders() });
  return {
    status: typeof json.status === "string" ? json.status : "scraping",
    total: Math.max(0, Number(json.total) || 0),
    completed: Math.max(0, Number(json.completed) || 0),
    pages: Array.isArray(json.data) ? json.data : [],
    next: typeof json.next === "string" ? verifiedResultUrl(json.next) : null,
  };
}

export function capturedPageBelongsToSource(raw: string, source: IngestionSource): boolean {
  try {
    const candidate = new URL(raw);
    const root = new URL(source.normalized_url);
    if (candidate.protocol !== "https:") return false;
    if (source.platform === "linkedin" && source.source_type === "social_profile") {
      return linkedinPostBelongsToCompany(raw, source);
    }
    if (!allowedSourceHost(candidate, source)) return false;
    if (source.crawl_scope === "exact") {
      return candidate.pathname.replace(/\/+$/u, "") === root.pathname.replace(/\/+$/u, "");
    }
    if (source.crawl_scope === "path" && source.path_prefix) {
      const prefix = source.path_prefix.replace(/\/+$/u, "") || "/";
      return candidate.pathname === prefix || candidate.pathname.startsWith(`${prefix}/`);
    }
    return true;
  } catch {
    return false;
  }
}

function pageUrl(page: FirecrawlPage, source: IngestionSource): string {
  return page.metadata?.canonicalUrl
    ?? page.metadata?.sourceURL
    ?? page.metadata?.url
    ?? source.url;
}

function readablePage(page: FirecrawlPage, source: IngestionSource): boolean {
  return capturedPageBelongsToSource(pageUrl(page, source), source)
    && typeof page.markdown === "string"
    && page.markdown.trim().length >= 20;
}

function parsePublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function commitPage(
  admin: AdminClient,
  source: IngestionSource,
  jobId: string,
  leaseToken: string,
  row: { id: string; payload: FirecrawlPage },
): Promise<boolean> {
  const page = row.payload;
  if (!readablePage(page, source)) return false;

  let canonicalUrl: string;
  try {
    canonicalUrl = resolveCompetitorUrl(pageUrl(page, source)).normalizedUrl;
  } catch {
    return false;
  }
  const content = page.markdown!.trim().slice(0, 200_000);
  const parsedUrl = new URL(canonicalUrl);
  const title = (typeof page.metadata?.title === "string" && page.metadata.title.trim())
    ? page.metadata.title.trim().slice(0, 500)
    : parsedUrl.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]+/gu, " ").slice(0, 500)
      || parsedUrl.hostname;
  const contentHash = createHash("sha256").update(content).digest("hex");
  const { error } = await admin.rpc("commit_competitor_crawl_page", {
    p_job_id: jobId,
    p_lease_token: leaseToken,
    p_page_id: row.id,
    p_canonical_url: canonicalUrl,
    p_platform: source.platform,
    p_content_type: source.platform === "linkedin" ? "social_post"
      : source.source_type === "blog" ? "article"
        : "page",
    p_title: title,
    p_raw_content: content,
    p_author: typeof page.metadata?.author === "string" ? page.metadata.author.slice(0, 300) : null,
    p_published_at: parsePublishedAt(page.metadata?.publishedTime),
    p_content_hash: contentHash,
    p_metadata: {
      sourceType: source.source_type,
      capturedBy: "firecrawl-v2",
      statusCode: page.metadata?.statusCode ?? null,
    },
  });
  if (error) throw new CompetitorIngestionError(`Couldn't store captured content: ${error.message}`);
  return true;
}

function retryDelay(failureCount: number): number {
  return Math.min(24 * 60 * 60 * 1000, 15 * 60 * 1000 * (2 ** Math.min(7, failureCount)));
}

async function markSourceFailure(
  admin: AdminClient,
  source: IngestionSource,
  message: string,
) {
  const nextFailure = Math.max(1, (source.failure_count ?? 0) + 1);
  const { error } = await admin
    .from("competitor_sources")
    .update({
      status: "retrying",
      failure_count: nextFailure,
      last_error: message.slice(0, 2000),
      last_crawled_at: new Date().toISOString(),
      next_refresh_at: new Date(Date.now() + retryDelay(nextFailure - 1)).toISOString(),
    })
    .eq("id", source.id)
    .eq("client_id", source.client_id);
  if (error) throw new CompetitorIngestionError(`Couldn't schedule collection retry: ${error.message}`);
}

async function cancelProvider(job: CompetitorCrawlJob): Promise<void> {
  if (!job.provider_job_id) return;
  const path = job.provider === "firecrawl_batch"
    ? "batch/scrape"
    : "crawl";
  await fetch(`${FIRECRAWL_API}/${path}/${encodeURIComponent(job.provider_job_id)}`, {
    method: "DELETE",
    headers: firecrawlHeaders(),
  }).catch(() => undefined);
}

export async function startCompetitorRefresh(
  admin: AdminClient,
  source: IngestionSource,
  createdBy: string | null,
): Promise<CompetitorCrawlJob> {
  let resolvedSource: ReturnType<typeof resolveCompetitorUrl>;
  try {
    resolvedSource = resolveCompetitorUrl(source.url);
  } catch (error) {
    throw new CompetitorIngestionError(
      error instanceof Error ? error.message : "This source URL is unsafe.",
      422,
    );
  }
  if (resolvedSource.normalizedUrl !== source.normalized_url) {
    throw new CompetitorIngestionError("The stored source URL failed integrity validation.", 422);
  }
  const collectableLinkedin = source.platform === "linkedin"
    && source.source_type === "social_profile"
    && isCollectableLinkedinCompanyUrl(source.normalized_url);
  if (
    resolvedSource.requiresConnector
    || source.source_type === "youtube"
    || (source.source_type === "social_profile" && !collectableLinkedin)
  ) {
    throw new CompetitorIngestionError(
      "This source is registered, but collection requires an approved platform connector or user-provided export.",
      422,
    );
  }
  if (source.status === "paused" || source.competitor_status === "paused") {
    throw new CompetitorIngestionError("Resume this source and competitor before refreshing it.", 409);
  }

  const { data: job, error: jobError } = await admin
    .rpc("create_competitor_crawl_job", {
      p_source_id: source.id,
      p_competitor_id: source.competitor_id,
      p_client_id: source.client_id,
      p_created_by: createdBy,
      p_pages_requested: source.max_pages + (
        ["feed", "sitemap"].includes(source.crawl_scope)
          ? 12
          : collectableLinkedin ? 1 : 0
      ),
      p_daily_crawl_limit: configuredLimit("COMPETITOR_DAILY_CRAWL_LIMIT", 20),
      p_daily_page_limit: configuredLimit("COMPETITOR_DAILY_PAGE_LIMIT", 500),
    })
    .single();
  if (jobError || !job) {
    const quota = jobError?.message?.includes("budget reached");
    const duplicate = jobError?.code === "23505";
    throw new CompetitorIngestionError(
      quota ? "This client's daily competitor collection budget has been reached."
        : duplicate ? "This source is already being refreshed."
          : jobError?.message ?? "Couldn't create the collection job.",
      quota ? 429 : duplicate ? 409 : 500,
    );
  }

  try {
    const provider = await startFirecrawl(source);
    const { data: started, error } = await admin
      .from("competitor_crawl_jobs")
      .update({
        status: "crawling",
        provider: provider.provider,
        provider_job_id: provider.id,
      })
      .eq("id", job.id)
      .eq("client_id", source.client_id)
      .select("*")
      .single();
    if (error || !started) throw new CompetitorIngestionError(error?.message ?? "Couldn't save collection progress.");

    const { error: sourceError } = await admin
      .from("competitor_sources")
      .update({ status: "active", last_error: null })
      .eq("id", source.id)
      .eq("client_id", source.client_id);
    if (sourceError) throw new CompetitorIngestionError(sourceError.message);
    return started as CompetitorCrawlJob;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't start source collection.";
    const { error: jobUpdateError } = await admin
      .from("competitor_crawl_jobs")
      .update({ status: "error", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("client_id", source.client_id);
    if (jobUpdateError) throw new CompetitorIngestionError(jobUpdateError.message);
    await markSourceFailure(admin, source, message);
    throw error;
  }
}

export async function advanceCompetitorCrawl(
  admin: AdminClient,
  jobId: string,
  expectedClientId?: string,
): Promise<CompetitorCrawlJob | null> {
  const { data: claimed, error: claimError } = await admin
    .rpc("claim_competitor_crawl_job", { p_job_id: jobId, p_lease_seconds: 90 })
    .maybeSingle();
  if (claimError) throw new CompetitorIngestionError(claimError.message);
  if (!claimed) return null;
  if (expectedClientId && claimed.client_id !== expectedClientId) {
    throw new CompetitorIngestionError("Forbidden.", 403);
  }

  const leaseToken = claimed.lease_token as string;
  const { data: sourceRow, error: sourceError } = await admin
    .from("competitor_sources")
    .select("*, competitors!inner(name, refresh_cadence, status, website_url)")
    .eq("id", claimed.source_id)
    .eq("client_id", claimed.client_id)
    .single();
  if (sourceError || !sourceRow) throw new CompetitorIngestionError(sourceError?.message ?? "Source not found.", 404);
  const source = {
    ...sourceRow,
    competitor_name: sourceRow.competitors?.name ?? "",
    competitor_cadence: sourceRow.competitors?.refresh_cadence ?? "manual",
    competitor_status: sourceRow.competitors?.status ?? "active",
    competitor_website_url: sourceRow.competitors?.website_url ?? null,
  } as IngestionSource;

  const checkpoint = async (
    status: CompetitorCrawlJob["status"],
    pages: number,
    items: number,
    errorMessage: string | null,
  ): Promise<CompetitorCrawlJob> => {
    const { data, error } = await admin
      .rpc("checkpoint_competitor_crawl_job", {
        p_job_id: claimed.id,
        p_lease_token: leaseToken,
        p_status: status,
        p_pages_discovered: pages,
        p_items_captured: items,
        p_error_message: errorMessage,
        p_meta: {},
      })
      .single();
    if (error || !data) {
      throw new CompetitorIngestionError(error?.message ?? "The collection lease expired before progress was saved.", 409);
    }
    return data as CompetitorCrawlJob;
  };

  try {
    if (claimed.cancel_requested_at || source.status === "paused" || source.competitor_status === "paused") {
      await cancelProvider(claimed as CompetitorCrawlJob);
      return checkpoint("cancelled", claimed.pages_discovered, claimed.items_captured, "Collection paused.");
    }
    if (!claimed.provider_job_id) throw new CompetitorIngestionError("The collection provider job is missing.");

    if (!claimed.provider_complete || claimed.next_result_url) {
      const result = await fetchFirecrawlResult(
        claimed.provider_job_id,
        claimed.provider,
        claimed.next_result_url,
      );
      if (["failed", "cancelled"].includes(result.status)) {
        const message = `Source collection ${result.status}.`;
        await markSourceFailure(admin, source, message);
        return checkpoint("error", result.total, claimed.items_captured, message);
      }
      const readable = result.pages.filter((page) => readablePage(page, source));
      const providerComplete = result.status === "completed" && !result.next;
      const { error: stageError } = await admin.rpc("stage_competitor_crawl_pages", {
        p_job_id: claimed.id,
        p_lease_token: leaseToken,
        p_pages: readable,
        p_next_result_url: result.next,
        p_provider_complete: providerComplete,
        p_pages_discovered: result.total || result.completed,
      });
      if (stageError) throw new CompetitorIngestionError(stageError.message);
      return checkpoint(
        providerComplete ? "ingesting" : "crawling",
        result.total || result.completed,
        claimed.items_captured,
        null,
      );
    }

    const { data: pending, error: pendingError } = await admin
      .from("competitor_crawl_pages")
      .select("id, payload")
      .eq("job_id", claimed.id)
      .eq("client_id", claimed.client_id)
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(INGEST_BATCH_SIZE);
    if (pendingError) throw new CompetitorIngestionError(pendingError.message);

    let captured = 0;
    for (const row of (pending ?? []) as { id: string; payload: FirecrawlPage }[]) {
      if (await commitPage(admin, source, claimed.id, leaseToken, row)) captured++;
    }

    const { count: remaining, error: remainingError } = await admin
      .from("competitor_crawl_pages")
      .select("id", { count: "exact", head: true })
      .eq("job_id", claimed.id)
      .eq("client_id", claimed.client_id)
      .is("processed_at", null);
    if (remainingError) throw new CompetitorIngestionError(remainingError.message);
    if ((remaining ?? 0) > 0) {
      return checkpoint(
        "ingesting",
        claimed.pages_discovered,
        claimed.items_captured + captured,
        null,
      );
    }

    const cadence = source.refresh_cadence ?? source.competitor_cadence ?? "manual";
    const capturedThisGeneration = claimed.items_captured + captured;
    const authoritative = source.crawl_scope === "exact"
      || (
        capturedThisGeneration > 0
        && claimed.pages_discovered > 0
        && claimed.pages_discovered < source.max_pages
      );
    const { data: completed, error: finalizeError } = await admin
      .rpc("finalize_competitor_crawl_job", {
        p_job_id: claimed.id,
        p_lease_token: leaseToken,
        p_authoritative: authoritative,
        p_next_refresh_at: nextRefreshAt(cadence),
      })
      .single();
    if (finalizeError || !completed) {
      throw new CompetitorIngestionError(finalizeError?.message ?? "Couldn't finalize collection.");
    }
    return completed as CompetitorCrawlJob;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source collection failed.";
    await markSourceFailure(admin, source, message);
    try {
      return await checkpoint("error", claimed.pages_discovered, claimed.items_captured, message);
    } catch {
      throw error;
    }
  }
}
