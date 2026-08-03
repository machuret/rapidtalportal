import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceProspectingJob } from "@/lib/prospecting/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const db = createAdminClient();
  const { data, error } = await db.from("prospecting_jobs")
    .select("id, client_id")
    .in("status", ["queued", "running", "ingesting"])
    .order("updated_at", { ascending: true })
    .limit(8);
  if (error) return NextResponse.json({ error: "Lead collection jobs could not be loaded." }, { status: 500 });
  let advanced = 0;
  let completed = 0;
  let failures = 0;
  for (const row of (data ?? []) as Array<{ id: string; client_id: string }>) {
    try {
      const job = await advanceProspectingJob(db, row.id, row.client_id);
      if (job) {
        advanced++;
        if (job.status === "done") completed++;
        if (job.status === "error") failures++;
      }
    } catch {
      failures++;
    }
  }
  await db.from("cron_heartbeats").upsert({
    name: "prospecting-jobs",
    ran_at: new Date().toISOString(),
    detail: { scanned: (data ?? []).length, advanced, completed, failures },
  });
  return NextResponse.json({ ok: failures === 0, scanned: (data ?? []).length, advanced, completed, failures }, {
    status: failures ? 500 : 200,
  });
}
