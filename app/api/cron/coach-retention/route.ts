import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_expired_coach_private_data");
  const deleted = typeof data === "number" ? data : 0;
  await admin.from("cron_heartbeats").upsert({
    name: "coach-retention",
    ran_at: new Date().toISOString(),
    detail: { deleted, failed: error ? 1 : 0 },
  });
  if (error) {
    console.error("[cron/coach-retention]", error);
    return NextResponse.json({ error: "Coach retention cleanup failed.", recoverable: true }, { status: 503 });
  }
  return NextResponse.json({ ok: true, deleted });
}
