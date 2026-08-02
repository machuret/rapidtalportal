/**
 * GET /api/cron/coach-proactive — weekly proactive Coach sweep.
 *
 * For a rotating batch of clients (least-recently-suggested first), draft a
 * "draft-and-confirm" Coach suggestion for each client admin who has real
 * triggers (overdue/unassigned/due-soon/review work) and no proactive turn in
 * the last 7 days. Everything it writes still requires the human to confirm
 * through the normal /api/coach/actions path — see lib/coach/proactive.ts.
 *
 * Auth: CRON_SECRET Bearer (same as every cron route).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import {
  runCoachProactiveForClient,
  selectProactiveClients,
} from "@/lib/coach/proactive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Resolving context + one LLM call per owner is slow; batch is capped at 10
// clients so a run stays well inside this.
export const maxDuration = 300;

const CLIENT_BATCH = 10;

async function recordHeartbeat(admin: SupabaseClient<Database>, detail: Json) {
  const result = await admin.from("cron_heartbeats").upsert({
    name: "coach-proactive", ran_at: new Date().toISOString(), detail,
  });
  if (result.error) console.error("coach-proactive: heartbeat failed", result.error);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const detail = {
    clients: 0, owners: 0, suggested: 0, quiet: 0, recent: 0, failed: 0,
  };

  try {
    const clientIds = await selectProactiveClients(admin, CLIENT_BATCH);
    detail.clients = clientIds.length;
    for (const clientId of clientIds) {
      const r = await runCoachProactiveForClient(admin, clientId);
      detail.owners += r.owners;
      detail.suggested += r.suggested;
      detail.quiet += r.quiet;
      detail.recent += r.recent;
      detail.failed += r.failed;
    }
  } catch (e) {
    console.error("coach-proactive: run failed", e);
    await recordHeartbeat(admin, { ...detail, stage: "run", error: true });
    return NextResponse.json({ error: "Coach proactive sweep failed.", recoverable: true }, { status: 503 });
  }

  await recordHeartbeat(admin, detail);
  return NextResponse.json({ ok: true, ...detail });
}
