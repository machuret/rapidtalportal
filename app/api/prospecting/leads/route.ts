import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";
import type { ProspectingLead } from "@/types/prospecting";

const statusSchema = z.enum(["new", "shortlisted", "dismissed", "imported"]);
const updateSchema = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(["new", "shortlisted", "dismissed"]),
});

export const GET = withAuth(async (req, { user }) => {
  const parsed = z.object({
    clientId: z.string().uuid(),
    status: z.union([statusSchema, z.literal("all")]).default("all"),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead filters." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const db = createAdminClient();
  let query = db.from("prospecting_campaign_leads")
    .select("id, campaign_id, job_id, client_id, status, crm_contact_id, discovered_at, last_seen_at, prospecting_prospects!inner(id, kind, company_name, person_name, job_title, website_url, linkedin_url, source_url, email, phone, address, locality, region, country_code, industry, rating, review_count, description, source, last_seen_at), prospecting_campaigns!inner(id, name, source)", { count: "exact" })
    .eq("client_id", parsed.data.clientId)
    .order("discovered_at", { ascending: false })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  if (parsed.data.status !== "all") query = query.eq("status", parsed.data.status);
  const { data, error, count } = await query;
  if (error) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  const leads = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    prospect: row.prospecting_prospects,
    campaign: row.prospecting_campaigns,
    prospecting_prospects: undefined,
    prospecting_campaigns: undefined,
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
  if (existing.status === "imported") return NextResponse.json({ error: "This lead is already in CRM." }, { status: 409 });
  const { data, error } = await db.from("prospecting_campaign_leads")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.clientId)
    .select("id, status")
    .single();
  if (error || !data) return serverError(error);
  return NextResponse.json({ lead: data });
});
