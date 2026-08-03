import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProspectingJobError, startProspectingEnrichment } from "@/lib/prospecting/jobs";
import { assertProspectingWebhookConfigured, prospectingWebhookUrl } from "@/lib/prospecting/webhook";
import { serverError } from "@/lib/api/errors";
import { leadEnrichmentLimiter, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ clientId: z.string().uuid(), leadId: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid lead is required." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const limit = await leadEnrichmentLimiter.check(`prospecting-enrich:${user.id}`);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  try { assertProspectingWebhookConfigured(); } catch {
    return NextResponse.json({ error: "Company-enrichment recovery is not configured." }, { status: 503 });
  }
  const db = createAdminClient();
  const { data, error } = await db.from("prospecting_campaign_leads")
    .select("id, client_id, status, prospecting_prospects!inner(website_url)")
    .eq("id", parsed.data.leadId)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (error) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  if (!data) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (!["new", "shortlisted"].includes(data.status)) {
    return NextResponse.json({ error: "Restore this lead before enriching it." }, { status: 409 });
  }
  const prospect = data.prospecting_prospects as unknown as { website_url: string | null };
  try {
    const job = await startProspectingEnrichment(
      db,
      { id: data.id, client_id: data.client_id, prospect },
      user.id,
      { webhookUrlForJob: prospectingWebhookUrl },
    );
    return NextResponse.json({ job }, { status: 202 });
  } catch (caught) {
    if (caught instanceof ProspectingJobError) {
      return NextResponse.json({ error: caught.message, retryable: caught.retryable }, { status: caught.status });
    }
    return serverError(caught, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  }
});
