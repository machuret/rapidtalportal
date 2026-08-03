import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApifyActorRun } from "@/lib/prospecting/apify-client";
import { advanceProspectingJob } from "@/lib/prospecting/jobs";
import { verifyProspectingWebhookToken } from "@/lib/prospecting/webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

const jobIdSchema = z.string().uuid();

function nestedRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
}

function webhookRunId(payload: unknown): string | null {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const resource = nestedRecord(root, "resource");
  const eventData = nestedRecord(root, "eventData");
  for (const value of [resource.id, resource.runId, eventData.actorRunId, root.actorRunId]) {
    if (typeof value === "string" && /^[a-zA-Z0-9_-]{5,100}$/u.test(value)) return value;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!jobIdSchema.safeParse(jobId).success || !verifyProspectingWebhookToken(jobId, token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  const runId = webhookRunId(payload);
  if (!runId) return NextResponse.json({ error: "Provider run not found in webhook." }, { status: 422 });

  const run = await getApifyActorRun(runId);
  const db = createAdminClient();
  const { data, error } = await db.rpc("reconcile_prospecting_provider_run", {
    p_job_id: jobId,
    p_actor_run_id: run.id,
    p_provider_status: run.status,
    p_actor_build_id: run.buildId,
    p_actor_dataset_id: run.defaultDatasetId,
    p_usage_total_usd: run.usageTotalUsd,
  });
  const reconciled = Array.isArray(data) ? data[0] : data;
  if (error || !reconciled) {
    return NextResponse.json({ error: "Lead collection webhook could not be reconciled." }, { status: 409 });
  }
  const advanced = await advanceProspectingJob(db, jobId, reconciled.client_id);
  return NextResponse.json({ ok: true, status: advanced?.status ?? reconciled.status }, { status: 202 });
}
