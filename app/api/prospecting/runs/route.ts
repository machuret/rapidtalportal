import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { leadGenerationLimiter, tooManyRequests } from "@/lib/rate-limit";
import { ProspectingJobError, startProspectingRun } from "@/lib/prospecting/jobs";
import { assertProspectingWebhookConfigured, prospectingWebhookUrl } from "@/lib/prospecting/webhook";
import type { ProspectingCampaign } from "@/types/prospecting";

const schema = z.object({ clientId: z.string().uuid(), campaignId: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid campaign." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const limit = await leadGenerationLimiter.check(`prospecting:${user.id}`);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  try { assertProspectingWebhookConfigured(); } catch {
    return NextResponse.json({ error: "Lead collection recovery is not configured." }, { status: 503 });
  }
  const db = createAdminClient();
  const { data, error } = await db.from("prospecting_campaigns")
    .select("*")
    .eq("id", parsed.data.campaignId)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  try {
    const job = await startProspectingRun(db, data as ProspectingCampaign, user.id, {
      webhookUrlForJob: prospectingWebhookUrl,
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (caught) {
    const status = caught instanceof ProspectingJobError ? caught.status : 500;
    const message = caught instanceof ProspectingJobError
      ? caught.message
      : "Lead collection could not be started.";
    return NextResponse.json({ error: message, retryable: caught instanceof ProspectingJobError && caught.retryable }, { status });
  }
});
