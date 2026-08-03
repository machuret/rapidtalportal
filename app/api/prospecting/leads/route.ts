import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";
import type { ProspectingJob, ProspectingLead } from "@/types/prospecting";

const statusSchema = z.enum(["new", "shortlisted", "dismissed", "imported"]);
const fitSchema = z.enum(["strong", "possible", "weak"]);
const updateSchema = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(["new", "shortlisted", "dismissed"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
}).refine((value) => value.status !== undefined || value.assignedTo !== undefined, "No update supplied.");

export const GET = withAuth(async (req, { user }) => {
  const parsed = z.object({
    clientId: z.string().uuid(),
    status: z.union([statusSchema, z.literal("all")]).default("all"),
    fit: z.union([fitSchema, z.literal("all")]).default("all"),
    sort: z.enum(["fit", "newest"]).default("fit"),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    id: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
  }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead filters." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const db = createAdminClient();
  let query = db.from("prospecting_campaign_leads")
    .select("id, campaign_id, job_id, client_id, status, assigned_to, crm_contact_id, discovered_at, last_seen_at, fit_score, fit_band, fit_breakdown, score_version, scored_at, latest_enrichment_id, latest_enrichment_job_id, prospecting_prospects!inner(id, kind, company_name, person_name, job_title, website_url, linkedin_url, source_url, email, phone, address, locality, region, country_code, industry, rating, review_count, description, source, last_seen_at), prospecting_campaigns!inner(id, name, source)", { count: "exact" })
    .eq("client_id", parsed.data.clientId);
  if (parsed.data.id) query = query.eq("id", parsed.data.id);
  if (!parsed.data.id && parsed.data.campaignId) query = query.eq("campaign_id", parsed.data.campaignId);
  if (!parsed.data.id && parsed.data.status !== "all") query = query.eq("status", parsed.data.status);
  if (!parsed.data.id && parsed.data.fit !== "all") query = query.eq("fit_band", parsed.data.fit);
  query = parsed.data.sort === "fit"
    ? query.order("fit_score", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false })
    : query.order("discovered_at", { ascending: false });
  query = query.range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  const { data, error, count } = await query;
  if (error) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  const rows = data ?? [];
  const enrichmentIds = rows.flatMap((row) => row.latest_enrichment_id ? [row.latest_enrichment_id] : []);
  const enrichmentJobIds = rows.flatMap((row) => row.latest_enrichment_job_id ? [row.latest_enrichment_job_id] : []);
  const [jobsResult, snapshotsResult] = await Promise.all([
    enrichmentJobIds.length
      ? db.from("prospecting_jobs").select("*").eq("client_id", parsed.data.clientId)
        .eq("job_type", "enrichment").in("id", enrichmentJobIds)
      : Promise.resolve({ data: [], error: null }),
    enrichmentIds.length
      ? db.from("prospecting_enrichment_snapshots")
        .select("id, website_url, canonical_domain, page_count, page_urls, title, description, emails, phones, social_links, captured_at")
        .eq("client_id", parsed.data.clientId).in("id", enrichmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (jobsResult.error) return serverError(jobsResult.error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  if (snapshotsResult.error) return serverError(snapshotsResult.error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  const jobsById = new Map((jobsResult.data ?? []).map((job) => [job.id, job as ProspectingJob]));
  const snapshotsById = new Map((snapshotsResult.data ?? []).map((snapshot) => [snapshot.id, snapshot]));
  const leads = rows.map((row: Record<string, unknown>) => ({
    ...row,
    prospect: row.prospecting_prospects,
    campaign: row.prospecting_campaigns,
    prospecting_prospects: undefined,
    prospecting_campaigns: undefined,
    latest_enrichment: typeof row.latest_enrichment_id === "string" ? snapshotsById.get(row.latest_enrichment_id) ?? null : null,
    active_enrichment_job: typeof row.latest_enrichment_job_id === "string"
      && ["queued", "running", "ingesting"].includes(jobsById.get(row.latest_enrichment_job_id)?.status ?? "")
      ? jobsById.get(row.latest_enrichment_job_id) ?? null : null,
    latest_enrichment_job: typeof row.latest_enrichment_job_id === "string" ? jobsById.get(row.latest_enrichment_job_id) ?? null : null,
  })) as unknown as ProspectingLead[];
  return NextResponse.json({ leads, total: count ?? 0, offset: parsed.data.offset, limit: parsed.data.limit });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead update." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const db = createAdminClient();
  const { data: existing, error: loadError } = await db.from("prospecting_campaign_leads")
    .select("id, status")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (loadError) return serverError(loadError);
  if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (existing.status === "imported" && parsed.data.status !== undefined) {
    return NextResponse.json({ error: "This lead is already in CRM." }, { status: 409 });
  }
  const { data, error } = await db.rpc("update_prospecting_lead_workflow", {
    p_lead_id: parsed.data.id,
    p_client_id: parsed.data.clientId,
    p_actor_id: user.id,
    p_status: parsed.data.status ?? null,
    p_set_assignee: parsed.data.assignedTo !== undefined,
    p_assigned_to: parsed.data.assignedTo ?? null,
  });
  const lead = Array.isArray(data) ? data[0] : data;
  if (error || !lead) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  return NextResponse.json({ lead });
});
