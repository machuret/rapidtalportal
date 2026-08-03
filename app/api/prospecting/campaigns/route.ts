import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProspectingAdapter } from "@/lib/prospecting/adapters";
import { serverError } from "@/lib/api/errors";
import type { ProspectingCampaign, ProspectingJob } from "@/types/prospecting";

const sourceSchema = z.enum(["google_maps", "google_search"]);
const createSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(160).optional(),
  source: sourceSchema.default("google_maps"),
  query: z.string().trim().min(2).max(300),
  location: z.string().trim().min(2).max(300),
  maxResults: z.number().int().min(1).max(100).default(20),
});
const updateSchema = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid(),
  archived: z.boolean(),
});

export const GET = withAuth(async (req, { user }) => {
  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  if (!z.string().uuid().safeParse(clientId).success) {
    return NextResponse.json({ error: "A valid client is required." }, { status: 422 });
  }
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;
  const db = createAdminClient();
  const { data, error } = await db.from("prospecting_campaigns")
    .select("*")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return serverError(error, { userId: user.id, clientId, url: req.nextUrl.pathname });
  const campaigns = (data ?? []) as ProspectingCampaign[];
  const jobIds = campaigns.flatMap((campaign) => campaign.last_job_id ? [campaign.last_job_id] : []);
  let jobs: ProspectingJob[] = [];
  if (jobIds.length) {
    const { data: jobRows, error: jobsError } = await db.from("prospecting_jobs")
      .select("*")
      .eq("client_id", clientId)
      .in("id", jobIds);
    if (jobsError) return serverError(jobsError, { userId: user.id, clientId, url: req.nextUrl.pathname });
    jobs = (jobRows ?? []) as ProspectingJob[];
  }
  const byId = new Map(jobs.map((job) => [job.id, job]));
  return NextResponse.json({
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      latest_job: campaign.last_job_id ? byId.get(campaign.last_job_id) ?? null : null,
    })),
  });
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the search details and try again.", issues: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const criteria = {
    queries: [parsed.data.query],
    locations: [parsed.data.location],
    maxResults: parsed.data.maxResults,
    countryCode: "au",
    languageCode: "en",
  };
  const validation = getProspectingAdapter(parsed.data.source).validate(criteria);
  if (!validation.valid) return NextResponse.json({ error: validation.errors[0] }, { status: 422 });
  const db = createAdminClient();
  const { data, error } = await db.from("prospecting_campaigns").insert({
    client_id: parsed.data.clientId,
    name: parsed.data.name || `${parsed.data.query} in ${parsed.data.location}`,
    source: parsed.data.source,
    queries: criteria.queries,
    locations: criteria.locations,
    country_code: "au",
    language_code: "en",
    max_results: parsed.data.maxResults,
    status: "ready",
    created_by: user.id,
  }).select("*").single();
  if (error || !data) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  return NextResponse.json({ campaign: data }, { status: 201 });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid campaign update." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const db = createAdminClient();
  const { data: existing, error: loadError } = await db.from("prospecting_campaigns")
    .select("id, status")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (loadError) return serverError(loadError);
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (parsed.data.archived && existing.status === "running") {
    return NextResponse.json({ error: "Wait for the active collection run to finish before archiving." }, { status: 409 });
  }
  const { data, error } = await db.from("prospecting_campaigns").update({
    archived_at: parsed.data.archived ? new Date().toISOString() : null,
    status: parsed.data.archived ? "archived" : "ready",
  }).eq("id", parsed.data.id).eq("client_id", parsed.data.clientId).select("*").single();
  if (error || !data) return serverError(error);
  return NextResponse.json({ campaign: data });
});
