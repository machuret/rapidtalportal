import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProspectingAdapter } from "@/lib/prospecting/adapters";
import { serverError } from "@/lib/api/errors";
import type { ProspectingCampaign, ProspectingJob } from "@/types/prospecting";
import { todayInTimezone } from "@/lib/date-tz";
import { discoverySourceCapabilities, ENABLED_DISCOVERY_SOURCES, type EnabledDiscoverySource } from "@/lib/prospecting/catalog";
import { leadCampaignMutationLimiter, tooManyRequests } from "@/lib/rate-limit";
import { PROSPECTING_ACTIVITY } from "@/lib/prospecting/activity";

const sourceSchema = z.enum(ENABLED_DISCOVERY_SOURCES);
const keywordList = z.array(z.string().trim().min(1).max(100)).max(12).default([]);
const idealProfileSchema = z.object({
  requiredKeywords: keywordList,
  preferredKeywords: keywordList,
  excludedKeywords: keywordList,
  minRating: z.number().min(0).max(5).default(0),
  minReviewCount: z.number().int().min(0).max(100_000).default(0),
  mustHaveWebsite: z.boolean().default(false),
});
const createSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(160).optional(),
  source: sourceSchema.default("google_maps"),
  query: z.string().trim().min(2).max(300),
  location: z.string().trim().min(2).max(300),
  maxResults: z.number().int().min(1).max(100).default(20),
  idealProfile: idealProfileSchema.optional(),
});
const updateSchema = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid(),
  archived: z.boolean().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  idealProfile: idealProfileSchema.optional(),
})
  .refine((value) => value.archived !== undefined || value.ownerId !== undefined || value.idealProfile !== undefined, "No update supplied.")
  .refine(
    (value) => value.idealProfile === undefined || (value.archived === undefined && value.ownerId === undefined),
    "Matching rules and workflow details must be saved separately.",
  );

function profileForSource(
  source: EnabledDiscoverySource,
  profile: z.infer<typeof idealProfileSchema> | undefined,
): z.infer<typeof idealProfileSchema> {
  const resolved = profile ?? {
    requiredKeywords: [], preferredKeywords: [], excludedKeywords: [],
    minRating: 0, minReviewCount: 0, mustHaveWebsite: false,
  };
  return discoverySourceCapabilities(source).supportsRatings
    ? resolved
    : { ...resolved, minRating: 0, minReviewCount: 0 };
}

export const GET = withAuth(async (req, { user }) => {
  const parsedQuery = z.object({
    clientId: z.string().uuid(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "A valid client is required." }, { status: 422 });
  }
  const { clientId, offset, limit } = parsedQuery.data;
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;
  const db = createAdminClient();
  const { data, error, count } = await db.from("prospecting_campaigns")
    .select("*", { count: "exact" })
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
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
  const { data: activeJobs, error: activeJobsError } = await db.from("prospecting_jobs")
    .select("*")
    .eq("client_id", clientId)
    .in("status", ["queued", "running", "ingesting"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (activeJobsError) return serverError(activeJobsError, { userId: user.id, clientId, url: req.nextUrl.pathname });
  const { data: usage, error: usageError } = await db.from("prospecting_usage")
    .select("runs_started, results_reserved, results_returned, reported_cost_usd, enrichments_started, enrichment_pages")
    .eq("client_id", clientId)
    .eq("usage_date", todayInTimezone("Australia/Sydney"))
    .maybeSingle();
  if (usageError) return serverError(usageError, { userId: user.id, clientId, url: req.nextUrl.pathname });
  const { data: collaborators, error: collaboratorsError } = await db.from("users")
    .select("id, full_name, email, role")
    .eq("client_id", clientId)
    .in("role", ["client_admin", "va"])
    .order("full_name", { ascending: true });
  if (collaboratorsError) return serverError(collaboratorsError, { userId: user.id, clientId, url: req.nextUrl.pathname });
  return NextResponse.json({
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      latest_job: campaign.last_job_id ? byId.get(campaign.last_job_id) ?? null : null,
    })),
    total: count ?? 0,
    offset,
    limit,
    usage: usage ?? { runs_started: 0, results_reserved: 0, results_returned: 0, reported_cost_usd: 0, enrichments_started: 0, enrichment_pages: 0 },
    active_jobs: activeJobs ?? [],
    collaborators: collaborators ?? [],
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
  const limit = await leadCampaignMutationLimiter.check(`prospecting-campaign:${user.id}`);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
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
  const { data, error } = await db.rpc("create_prospecting_campaign_once", {
    p_client_id: parsed.data.clientId,
    p_name: parsed.data.name || `${parsed.data.query} in ${parsed.data.location}`,
    p_source: parsed.data.source,
    p_queries: criteria.queries,
    p_locations: criteria.locations,
    p_country_code: "au",
    p_language_code: "en",
    p_max_results: parsed.data.maxResults,
    p_ideal_profile: profileForSource(parsed.data.source, parsed.data.idealProfile),
    p_created_by: user.id,
  });
  if (error || !data) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  const result = data as unknown as { campaign: ProspectingCampaign; reused: boolean };
  if (result.reused) {
    return NextResponse.json({
      error: "This exact search already exists. Open it in Campaigns and choose Run again instead of creating a duplicate.",
      existingCampaignId: result.campaign.id,
    }, { status: 409 });
  }
  return NextResponse.json({ campaign: result.campaign }, { status: 201 });
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
    .select("id, source")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (loadError) return serverError(loadError);
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (parsed.data.idealProfile) {
    const { data, error } = await db.rpc("update_prospecting_campaign_profile", {
      p_campaign_id: parsed.data.id,
      p_client_id: parsed.data.clientId,
      p_profile: profileForSource(existing.source as EnabledDiscoverySource, parsed.data.idealProfile),
    });
    const campaign = Array.isArray(data) ? data[0] : data;
    if (error || !campaign) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
    const { error: activityError } = await db.rpc("record_prospecting_activity", {
      p_client_id: parsed.data.clientId, p_actor_id: user.id,
      p_event_type: PROSPECTING_ACTIVITY.matchingRulesUpdated, p_campaign_id: parsed.data.id,
      p_detail: {},
    });
    if (activityError) return serverError(activityError, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
    return NextResponse.json({ campaign });
  }
  const { data, error } = await db.rpc("update_prospecting_campaign_workflow", {
    p_campaign_id: parsed.data.id,
    p_client_id: parsed.data.clientId,
    p_actor_id: user.id,
    p_set_owner: parsed.data.ownerId !== undefined,
    p_owner_id: parsed.data.ownerId ?? null,
    p_archived: parsed.data.archived ?? null,
  });
  const campaign = Array.isArray(data) ? data[0] : data;
  if (error || !campaign) {
    const message = typeof error?.message === "string" && error.message.includes("active work")
      ? "Wait for active collection or enrichment to finish before archiving."
      : "Campaign could not be updated.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Wait") ? 409 : 500 });
  }
  return NextResponse.json({ campaign });
});
