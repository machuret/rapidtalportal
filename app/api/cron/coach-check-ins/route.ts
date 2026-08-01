import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClaimedCheckIn = { id: string; check_in_claim_token: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated schema follows migration 139
async function recordHeartbeat(admin: any, detail: Record<string, unknown>) {
  const result = await admin.from("cron_heartbeats").upsert({
    name: "coach-check-ins", ran_at: new Date().toISOString(), detail,
  });
  if (result.error) console.error("coach-check-ins: heartbeat failed", result.error);
  return !result.error;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 138 precedes generated schema refresh
  const admin = createAdminClient() as any;
  const claimed = await admin.rpc("claim_due_coach_check_ins", { p_limit: 100 });
  if (claimed.error) {
    await recordHeartbeat(admin, { claimed: 0, delivered: 0, failed: 1, stage: "claim" });
    return NextResponse.json({ error: "Coach check-ins could not be claimed.", recoverable: true }, { status: 503 });
  }
  let delivered = 0;
  let failed = 0;
  let releaseFailed = 0;
  for (const item of (claimed.data ?? []) as ClaimedCheckIn[]) {
    if (!item.check_in_claim_token) continue;
    const result = await admin.rpc("deliver_coach_check_in", {
      p_commitment_id: item.id, p_claim_token: item.check_in_claim_token,
    });
    if (result.error || result.data !== true) {
      failed++;
      const released = await admin.rpc("complete_coach_check_in", {
        p_commitment_id: item.id, p_claim_token: item.check_in_claim_token, p_delivered: false,
      });
      if (released.error || released.data !== true) {
        releaseFailed++;
        console.error("coach-check-ins: failed lease could not be released", { commitmentId: item.id, error: released.error });
      }
    } else delivered++;
  }
  const heartbeatRecorded = await recordHeartbeat(admin, {
    claimed: (claimed.data ?? []).length, delivered, failed, releaseFailed,
    stage: failed ? "delivery" : "complete",
  });
  const ok = failed === 0 && heartbeatRecorded;
  return NextResponse.json({ ok, claimed: (claimed.data ?? []).length, delivered, failed, releaseFailed, heartbeatRecorded }, { status: ok ? 200 : 503 });
}
