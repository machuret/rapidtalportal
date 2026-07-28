import { createHash } from "node:crypto";
import { nextRefreshAt, resolveCompetitorUrl } from "@/lib/competitors/urls";
import type {
  CompetitorCrawlJob,
  CompetitorRefreshCadence,
  CompetitorSource,
} from "@/types/competitors";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";
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
  competitor_cadence?: CompetitorRefreshCadence;
}

interface FirecrawlPage {
  markdown?: string;
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

interface FirecrawlResult {
  status: string;
  total: number;
  completed: number;
  pages: FirecrawlPage[];
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

export function buildCompetitorCrawlRequest(source: IngestionSource) {
  const parsed = new URL(source.url);
  const body: Record<string, unknown> = {
    url: source.crawl_scope === "sitemap" ? parsed.origin : source.url,
    limit: source.max_pages,
    excludePaths: EXCLUDED_PATHS,
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 1500,
      timeout: 45000,
    },
  };

  if (source.crawl_scope === "exact") {
    body.limit = 1;
    body.maxDepth = 0;
  } else if (source.crawl_scope === "path" && source.path_prefix) {
    body.includePaths = [`${source.path_prefix.replace(/^\//u, "")}*`];
  }
  return body;
}

async function startFirecrawl(source: IngestionSource): Promise<string> {
  const response = await fetch(`${FIRECRAWL_API}/crawl`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey()}`,
    },
    body: JSON.stringify(buildCompetitorCrawlRequest(source)),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || typeof json?.id !== "string") {
    throw new CompetitorIngestionError(
      `Couldn't start source collection: ${json?.error ?? `Firecrawl returned ${response.status}`}`,
      502,
    );
  }
  return json.id;
}

async function fetchFirecrawlResult(providerJobId: string): Promise<FirecrawlResult> {
  let nextUrl: string | null = `${FIRECRAWL_API}/crawl/${providerJobId}`;
  const pages: FirecrawlPage[] = [];
  let status = "scraping";
  let total = 0;
  let completed = 0;

  for (let page = 0; nextUrl && page < 10; page++) {
    const response: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${firecrawlKey()}` },
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new CompetitorIngestionError(
        json?.error ?? `Source collection returned ${response.status}`,
        502,
      );
    }
    status = typeof json.status === "string" ? json.status : status;
    total = Number(json.total ?? total) || 0;
    completed = Number(json.completed ?? completed) || 0;
    if (Array.isArray(json.data)) pages.push(...json.data);
    nextUrl = typeof json.next === "string" ? json.next : null;
  }
  return { status, total, completed, pages };
}

export function capturedPageBelongsToSource(raw: string, source: IngestionSource): boolean {
  try {
    const candidate = new URL(raw);
    const root = new URL(source.normalized_url);
    if (candidate.protocol !== "https:" || candidate.hostname !== root.hostname) return false;
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

function parsePublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function capturePages(
  admin: AdminClient,
  source: IngestionSource,
  pages: FirecrawlPage[],
): Promise<number> {
  const seen = new Set<string>();
  let captured = 0;

  for (const page of pages.slice(0, source.max_pages)) {
    const rawUrl = page.metadata?.canonicalUrl
      ?? page.metadata?.sourceURL
      ?? page.metadata?.url
      ?? source.url;
    if (!capturedPageBelongsToSource(rawUrl, source)) continue;

    let canonicalUrl: string;
    try {
      canonicalUrl = resolveCompetitorUrl(rawUrl).normalizedUrl;
    } catch {
      continue;
    }
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    const content = typeof page.markdown === "string"
      ? page.markdown.trim().slice(0, 200_000)
      : "";
    if (content.length < 20) continue;

    const title = (typeof page.metadata?.title === "string" && page.metadata.title.trim())
      ? page.metadata.title.trim().slice(0, 500)
      : new URL(canonicalUrl).pathname.split("/").filter(Boolean).pop()?.replace(/[-_]+/gu, " ").slice(0, 500)
        || new URL(canonicalUrl).hostname;
    const contentHash = createHash("sha256").update(content).digest("hex");
    const { error } = await admin.rpc("upsert_competitor_content_item", {
      p_source_id: source.id,
      p_competitor_id: source.competitor_id,
      p_client_id: source.client_id,
      p_canonical_url: canonicalUrl,
      p_platform: source.platform,
      p_content_type: source.source_type === "blog" ? "article" : "page",
      p_title: title,
      p_raw_content: content,
      p_author: typeof page.metadata?.author === "string" ? page.metadata.author.slice(0, 300) : null,
      p_published_at: parsePublishedAt(page.metadata?.publishedTime),
      p_content_hash: contentHash,
      p_metadata: {
        sourceType: source.source_type,
        capturedBy: "firecrawl",
        statusCode: page.metadata?.statusCode ?? null,
      },
    });
    if (error) throw new CompetitorIngestionError(`Couldn't store captured content: ${error.message}`);
    captured++;
  }

  return captured;
}

async function markSourceFailure(
  admin: AdminClient,
  sourceId: string,
  message: string,
) {
  await admin
    .from("competitor_sources")
    .update({
      status: "error",
      last_error: message.slice(0, 2000),
      last_crawled_at: new Date().toISOString(),
    })
    .eq("id", sourceId);
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
  if (resolvedSource.requiresConnector) {
    throw new CompetitorIngestionError(
      "This source is registered, but collection requires an approved platform connector or user-provided export.",
      422,
    );
  }
  if (source.status === "paused") {
    throw new CompetitorIngestionError("Resume this source before refreshing it.", 409);
  }
  if (source.source_type === "social_profile" || source.source_type === "youtube") {
    throw new CompetitorIngestionError(
      "This source is registered, but collection requires an approved platform connector or user-provided export.",
      422,
    );
  }

  const { data: active, error: activeError } = await admin
    .from("competitor_crawl_jobs")
    .select("id")
    .eq("source_id", source.id)
    .in("status", ["queued", "crawling", "ingesting"])
    .limit(1)
    .maybeSingle();
  if (activeError) throw new CompetitorIngestionError(activeError.message);
  if (active) throw new CompetitorIngestionError("This source is already being refreshed.", 409);

  const { data: job, error: jobError } = await admin
    .from("competitor_crawl_jobs")
    .insert({
      source_id: source.id,
      competitor_id: source.competitor_id,
      client_id: source.client_id,
      status: "queued",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (jobError || !job) {
    throw new CompetitorIngestionError(jobError?.message ?? "Couldn't create the collection job.");
  }

  try {
    const providerJobId = await startFirecrawl(source);
    const { data: started, error } = await admin
      .from("competitor_crawl_jobs")
      .update({ status: "crawling", provider_job_id: providerJobId })
      .eq("id", job.id)
      .eq("client_id", source.client_id)
      .select("*")
      .single();
    if (error || !started) throw new CompetitorIngestionError(error?.message ?? "Couldn't save collection progress.");

    await admin
      .from("competitor_sources")
      .update({ status: "active", last_error: null })
      .eq("id", source.id)
      .eq("client_id", source.client_id);
    return started as CompetitorCrawlJob;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't start source collection.";
    await admin
      .from("competitor_crawl_jobs")
      .update({ status: "error", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    await markSourceFailure(admin, source.id, message);
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
    .select("*, competitors!inner(refresh_cadence)")
    .eq("id", claimed.source_id)
    .eq("client_id", claimed.client_id)
    .single();
  if (sourceError || !sourceRow) throw new CompetitorIngestionError(sourceError?.message ?? "Source not found.", 404);
  const source = {
    ...sourceRow,
    competitor_cadence: sourceRow.competitors?.refresh_cadence ?? "manual",
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
    if (!claimed.provider_job_id) throw new CompetitorIngestionError("The collection provider job is missing.");
    const result = await fetchFirecrawlResult(claimed.provider_job_id);
    if (["failed", "cancelled"].includes(result.status)) {
      const message = `Source collection ${result.status}.`;
      await markSourceFailure(admin, source.id, message);
      return checkpoint("error", result.total, claimed.items_captured, message);
    }
    if (result.status !== "completed") {
      return checkpoint("crawling", result.total || result.completed, claimed.items_captured, null);
    }

    const captured = await capturePages(admin, source, result.pages);
    const { count, error: countError } = await admin
      .from("competitor_content_items")
      .select("id", { count: "exact", head: true })
      .eq("source_id", source.id)
      .eq("client_id", source.client_id)
      .eq("is_removed", false);
    if (countError) throw new CompetitorIngestionError(countError.message);

    const now = new Date();
    const cadence = source.refresh_cadence ?? source.competitor_cadence ?? "manual";
    const sourceStatus = captured > 0 || (count ?? 0) > 0 ? "active" : "error";
    const lastError = sourceStatus === "error" ? "No readable public content was returned for this URL." : null;
    const { error: updateError } = await admin
      .from("competitor_sources")
      .update({
        status: sourceStatus,
        content_count: count ?? 0,
        last_crawled_at: now.toISOString(),
        last_success_at: sourceStatus === "active" ? now.toISOString() : source.last_success_at,
        next_refresh_at: nextRefreshAt(cadence, now),
        last_error: lastError,
      })
      .eq("id", source.id)
      .eq("client_id", source.client_id);
    if (updateError) throw new CompetitorIngestionError(updateError.message);

    return checkpoint(
      sourceStatus === "active" ? "done" : "error",
      result.pages.length,
      captured,
      lastError,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source collection failed.";
    await markSourceFailure(admin, source.id, message);
    try {
      return await checkpoint("error", claimed.pages_discovered, claimed.items_captured, message);
    } catch {
      throw error;
    }
  }
}
