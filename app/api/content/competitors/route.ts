import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { serverError } from "@/lib/api/errors";
import { resolveCompetitorUrl } from "@/lib/competitors/urls";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Competitor,
  CompetitorContentItem,
  CompetitorCrawlJob,
  CompetitorSource,
} from "@/types/competitors";

const cadence = z.enum(["manual", "daily", "weekly", "monthly"]);
const querySchema = z.object({ client_id: z.string().uuid() });
const createSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().default(""),
  website_url: z.string().trim().max(2000).optional().default(""),
  refresh_cadence: cadence.default("manual"),
  max_pages: z.number().int().min(1).max(100).default(30),
});
const updateSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "paused"]).optional(),
  refresh_cadence: cadence.optional(),
}).refine((value) => Object.keys(value).some((key) => !["client_id", "id"].includes(key)), {
  message: "No changes supplied.",
});
const deleteSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
});

const MANAGER_ROLES = ["client_admin", "super_admin"] as const;

export const GET = withAuth(async (req, { user }) => {
  const parsed = querySchema.safeParse({
    client_id: req.nextUrl.searchParams.get("client_id"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // Migration 095 tables are accessed before the next generated-type refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const [{ data: competitors, error }, { data: sources, error: sourceError }, { data: jobs, error: jobError }, { data: items, error: itemError }] = await Promise.all([
    db
      .from("competitors")
      .select("id, client_id, name, description, website_url, status, refresh_cadence, created_at, updated_at")
      .eq("client_id", parsed.data.client_id)
      .order("name"),
    db
      .from("competitor_sources")
      .select("id, competitor_id, client_id, source_type, platform, url, normalized_url, crawl_scope, path_prefix, status, refresh_cadence, max_pages, content_count, last_crawled_at, last_success_at, next_refresh_at, last_error, created_at")
      .eq("client_id", parsed.data.client_id)
      .order("created_at"),
    db
      .from("competitor_crawl_jobs")
      .select("id, source_id, competitor_id, client_id, status, pages_discovered, items_captured, error_message, created_at, updated_at, completed_at")
      .eq("client_id", parsed.data.client_id)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("competitor_content_items")
      .select("id, source_id, competitor_id, canonical_url, platform, content_type, title, published_at, captured_at")
      .eq("client_id", parsed.data.client_id)
      .eq("is_removed", false)
      .order("captured_at", { ascending: false })
      .limit(50),
  ]);
  if (error) return serverError(error);
  if (sourceError) return serverError(sourceError);
  if (jobError) return serverError(jobError);
  if (itemError) return serverError(itemError);

  const jobBySource = new Map<string, CompetitorCrawlJob>();
  for (const job of (jobs ?? []) as CompetitorCrawlJob[]) {
    if (!jobBySource.has(job.source_id)) jobBySource.set(job.source_id, job);
  }
  const sourcesByCompetitor = new Map<string, CompetitorSource[]>();
  for (const source of (sources ?? []) as CompetitorSource[]) {
    const enriched = { ...source, latest_job: jobBySource.get(source.id) ?? null };
    const group = sourcesByCompetitor.get(source.competitor_id) ?? [];
    group.push(enriched);
    sourcesByCompetitor.set(source.competitor_id, group);
  }
  const itemsByCompetitor = new Map<string, CompetitorContentItem[]>();
  for (const item of (items ?? []) as CompetitorContentItem[]) {
    const group = itemsByCompetitor.get(item.competitor_id) ?? [];
    if (group.length < 5) group.push(item);
    itemsByCompetitor.set(item.competitor_id, group);
  }

  const response = ((competitors ?? []) as Omit<Competitor, "sources" | "recent_items">[]).map((competitor) => ({
    ...competitor,
    sources: sourcesByCompetitor.get(competitor.id) ?? [],
    recent_items: itemsByCompetitor.get(competitor.id) ?? [],
  }));
  return NextResponse.json({ competitors: response });
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  let source: ReturnType<typeof resolveCompetitorUrl> | null = null;
  if (parsed.data.website_url) {
    try {
      source = resolveCompetitorUrl(parsed.data.website_url, "domain");
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid website URL." },
        { status: 422 },
      );
    }
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: id, error } = await (admin as any).rpc("create_competitor_with_source", {
    p_client_id: parsed.data.client_id,
    p_actor_id: user.id,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_website_url: source?.normalizedUrl ?? "",
    p_refresh_cadence: parsed.data.refresh_cadence,
    p_source_type: source?.sourceType ?? "website",
    p_platform: source?.platform ?? "web",
    p_normalized_url: source?.normalizedUrl ?? "",
    p_crawl_scope: source?.crawlScope ?? "domain",
    p_path_prefix: source?.pathPrefix ?? null,
    p_source_status: source?.requiresConnector ? "connector_required" : "active",
    p_max_pages: parsed.data.max_pages,
  });
  if (error) return serverError(error);
  return NextResponse.json({ id }, { status: 201 });
}, { roles: [...MANAGER_ROLES] });

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const { client_id, id, ...updates } = parsed.data;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data, error } = await db
    .from("competitors")
    .update(updates)
    .eq("id", id)
    .eq("client_id", client_id)
    .select("id")
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });

  if (parsed.data.refresh_cadence) {
    const next = parsed.data.refresh_cadence === "manual" ? null : new Date().toISOString();
    const { error: sourceError } = await db
      .from("competitor_sources")
      .update({ next_refresh_at: next })
      .eq("competitor_id", id)
      .eq("client_id", client_id)
      .is("refresh_cadence", null)
      .eq("status", "active");
    if (sourceError) return serverError(sourceError);
  }
  return NextResponse.json({ ok: true });
}, { roles: [...MANAGER_ROLES] });

export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("competitors")
    .delete()
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select("id")
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}, { roles: [...MANAGER_ROLES] });
