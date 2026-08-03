import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  advanceProspectingProviderCheck,
  PROSPECTING_PROVIDER_IDS,
  startProspectingProviderCheck,
  type ProspectingProviderCheck,
} from "@/lib/prospecting/provider-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const db = createAdminClient();
  if (!process.env.APIFY_API_TOKEN) {
    await db.from("cron_heartbeats").upsert({
      name: "prospecting-provider-health", ran_at: new Date().toISOString(),
      detail: { configured: false, started: 0, advanced: 0, failures: 0 },
    });
    return NextResponse.json({ ok: false, error: "Apify API is not configured." }, { status: 503 });
  }

  const { data, error } = await db.from("prospecting_provider_checks")
    .select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Scraper checks could not be loaded." }, { status: 500 });
  const latest = new Map<string, ProspectingProviderCheck>();
  for (const check of (data ?? []) as ProspectingProviderCheck[]) {
    if (!latest.has(check.provider)) latest.set(check.provider, check);
  }

  let started = 0;
  let advanced = 0;
  let failures = 0;
  const now = Date.now();
  for (const provider of PROSPECTING_PROVIDER_IDS) {
    const check = latest.get(provider);
    try {
      if (check && ["queued", "running"].includes(check.status)) {
        await advanceProspectingProviderCheck(provider, check.id);
        advanced += 1;
        continue;
      }
      const checkedAt = check?.completed_at ?? check?.created_at;
      const retryAfter = check?.status === "passed" ? 7 * 24 * 60 * 60_000 : 24 * 60 * 60_000;
      if (!checkedAt || now - new Date(checkedAt).getTime() >= retryAfter) {
        await startProspectingProviderCheck(provider, null);
        started += 1;
      }
    } catch {
      failures += 1;
    }
  }
  await db.from("cron_heartbeats").upsert({
    name: "prospecting-provider-health", ran_at: new Date().toISOString(),
    detail: { configured: true, started, advanced, failures },
  });
  return NextResponse.json({ ok: failures === 0, started, advanced, failures }, { status: failures ? 500 : 200 });
}
