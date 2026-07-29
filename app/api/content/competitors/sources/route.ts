import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { serverError } from "@/lib/api/errors";
import { resolveCompetitorUrl } from "@/lib/competitors/urls";
import { createAdminClient } from "@/lib/supabase/admin";

const MANAGER_ROLES = ["client_admin", "super_admin"] as const;
const cadence = z.enum(["manual", "daily", "weekly", "monthly"]);
const createSchema = z.object({
  client_id: z.string().uuid(),
  competitor_id: z.string().uuid(),
  url: z.string().trim().min(1).max(2000),
  crawl_scope: z.enum(["auto", "exact", "path", "domain"]).default("auto"),
  refresh_cadence: cadence.nullable().optional().default(null),
  max_pages: z.number().int().min(1).max(100).default(30),
});
const updateSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(["active", "paused"]).optional(),
  refresh_cadence: cadence.nullable().optional(),
  max_pages: z.number().int().min(1).max(100).optional(),
}).refine((value) => Object.keys(value).some((key) => !["client_id", "id"].includes(key)), {
  message: "No changes supplied.",
});
const deleteSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
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

  let resolved: ReturnType<typeof resolveCompetitorUrl>;
  try {
    resolved = resolveCompetitorUrl(parsed.data.url, parsed.data.crawl_scope);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid source URL." },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  // Migration 095 tables are accessed before the next generated-type refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: competitor, error: competitorError } = await db
    .from("competitors")
    .select("id, refresh_cadence")
    .eq("id", parsed.data.competitor_id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (competitorError || !competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const { data, error } = await db
    .from("competitor_sources")
    .insert({
      competitor_id: parsed.data.competitor_id,
      client_id: parsed.data.client_id,
      source_type: resolved.sourceType,
      platform: resolved.platform,
      url: resolved.url,
      normalized_url: resolved.normalizedUrl,
      crawl_scope: resolved.crawlScope,
      path_prefix: resolved.pathPrefix,
      status: resolved.requiresConnector ? "connector_required" : "active",
      refresh_cadence: parsed.data.refresh_cadence,
      max_pages: resolved.crawlScope === "exact" ? 1 : parsed.data.max_pages,
      // New automatic sources are due immediately; subsequent successful
      // collections advance according to the configured cadence.
      next_refresh_at: resolved.requiresConnector
        || (parsed.data.refresh_cadence ?? competitor.refresh_cadence) === "manual"
        ? null
        : new Date().toISOString(),
      created_by: user.id,
    })
    .select("id, source_type, platform, crawl_scope, status")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This URL is already attached to the competitor." }, { status: 409 });
    }
    return serverError(error);
  }
  return NextResponse.json(data, { status: 201 });
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

  const updates: Record<string, unknown> = {};
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: current, error: currentError } = await db
    .from("competitor_sources")
    .select("id, source_type, refresh_cadence, competitors!inner(refresh_cadence)")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .maybeSingle();
  if (currentError) return serverError(currentError);
  if (!current) return NextResponse.json({ error: "Source not found." }, { status: 404 });

  if (
    parsed.data.status === "active"
    && ["social_profile", "youtube"].includes(current.source_type)
  ) {
    return NextResponse.json(
      { error: "This source requires an approved connector or user-provided export." },
      { status: 422 },
    );
  }

  if (parsed.data.status) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "active") {
      const effective = parsed.data.refresh_cadence
        ?? current.refresh_cadence
        ?? current.competitors?.refresh_cadence
        ?? "manual";
      updates.next_refresh_at = effective === "manual" ? null : new Date().toISOString();
      updates.last_error = null;
      updates.failure_count = 0;
    }
  }
  if (parsed.data.max_pages !== undefined) updates.max_pages = parsed.data.max_pages;
  if (parsed.data.refresh_cadence !== undefined) {
    updates.refresh_cadence = parsed.data.refresh_cadence;
    const effective = parsed.data.refresh_cadence
      ?? current.competitors?.refresh_cadence
      ?? "manual";
    updates.next_refresh_at = effective !== "manual"
      ? new Date().toISOString()
      : null;
  }
  if (parsed.data.status === "paused") updates.next_refresh_at = null;

  const { data, error } = await db
    .from("competitor_sources")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select("id")
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) return NextResponse.json({ error: "Source not found." }, { status: 404 });
  if (parsed.data.status === "paused") {
    const { error: cancelError } = await db
      .from("competitor_crawl_jobs")
      .update({ cancel_requested_at: new Date().toISOString() })
      .eq("source_id", parsed.data.id)
      .eq("client_id", parsed.data.client_id)
      .in("status", ["queued", "crawling", "ingesting"]);
    if (cancelError) return serverError(cancelError);
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
    .from("competitor_sources")
    .delete()
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select("id")
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) return NextResponse.json({ error: "Source not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}, { roles: [...MANAGER_ROLES] });
