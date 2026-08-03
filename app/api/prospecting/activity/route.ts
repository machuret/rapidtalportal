import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";

export const GET = withAuth(async (req, { user }) => {
  const parsed = z.object({
    clientId: z.string().uuid(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activity filters." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const db = createAdminClient();
  const { data, error, count } = await db.from("prospecting_activity_events")
    .select("*", { count: "exact" })
    .eq("client_id", parsed.data.clientId)
    .order("created_at", { ascending: false })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  if (error) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });

  const userIds = Array.from(new Set((data ?? []).flatMap((event) => (
    [event.actor_id, event.subject_user_id].filter((id): id is string => typeof id === "string")
  ))));
  const campaignIds = Array.from(new Set((data ?? []).flatMap((event) => event.campaign_id ? [event.campaign_id] : [])));
  const leadIds = Array.from(new Set((data ?? []).flatMap((event) => event.lead_id ? [event.lead_id] : [])));
  const [peopleResult, campaignsResult, leadsResult] = await Promise.all([
    userIds.length
      ? db.from("users").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    campaignIds.length
      ? db.from("prospecting_campaigns").select("id, name").eq("client_id", parsed.data.clientId).in("id", campaignIds)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? db.from("prospecting_campaign_leads")
        .select("id, prospecting_prospects!inner(company_name, person_name)")
        .eq("client_id", parsed.data.clientId).in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = peopleResult.error || campaignsResult.error || leadsResult.error;
  if (relatedError) return serverError(relatedError, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  const people = peopleResult.data ?? [];
  const names = new Map((people ?? []).map((person) => [person.id, person.full_name || person.email]));
  const campaignNames = new Map((campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign.name]));
  const leadNames = new Map((leadsResult.data ?? []).map((lead) => {
    const prospect = lead.prospecting_prospects as unknown as { company_name: string | null; person_name: string | null };
    return [lead.id, prospect.person_name || prospect.company_name || "Unnamed lead"];
  }));

  return NextResponse.json({
    events: (data ?? []).map((event) => ({
      ...event,
      actor_name: event.actor_id ? names.get(event.actor_id) ?? "Former team member" : "System",
      campaign_name: event.campaign_id ? campaignNames.get(event.campaign_id) ?? null : null,
      lead_name: event.lead_id ? leadNames.get(event.lead_id) ?? null : null,
      subject_name: event.subject_user_id ? names.get(event.subject_user_id) ?? "Former team member" : null,
    })),
    total: count ?? 0,
    offset: parsed.data.offset,
    limit: parsed.data.limit,
  });
});
