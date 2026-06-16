/**
 * Scheduled Brain distillation, driven by Vercel Cron (see vercel.json).
 *
 * Finds clients with undistilled feedback and folds it into curated Brain Memory
 * (lib/brain/distill.ts), in small batches so one slow client can't starve the
 * run. This is the always-on guarantee behind "the Brain learns from mistakes";
 * the admin "Distill now" button is the manual counterpart.
 *
 * Auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { distillClientMemory, decayClientMemory } from "@/lib/brain/distill";
import { computeBrainScore } from "@/lib/brain/score";
import { logBrainEvent } from "@/lib/brain/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CLIENTS_PER_RUN = 25;
// Idle clients (no new feedback) still get a daily decay + score snapshot so
// stale lessons fade and the trend line keeps moving. Score is cheap (a few
// counts), so we can sweep a larger batch than distillation.
const SNAPSHOT_BATCH = 100;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const beat = (detail: Record<string, number>) =>
    admin.from("cron_heartbeats").upsert({ name: "brain-distill", ran_at: new Date().toISOString(), detail });

  // Distinct clients that have feedback not yet folded into memory.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pending } = await (admin as any)
    .from("brain_signals")
    .select("client_id")
    .is("distilled_at", null)
    .order("created_at", { ascending: true })
    .limit(2000);

  const clientIds = Array.from(new Set((pending ?? []).map((r: { client_id: string }) => r.client_id))).slice(0, MAX_CLIENTS_PER_RUN) as string[];

  // Phase 1: clients with new feedback → distil + snapshot. (Phase 2 below still
  // runs even when this is empty, so idle clients always get decay + a snapshot.)
  let newMemories = 0;
  let processed = 0;
  for (const clientId of clientIds) {
    try {
      const r = await distillClientMemory(admin, clientId);
      newMemories += r.newMemories;
      processed += r.processedSignals;
      await snapshotScore(admin, clientId);
    } catch (e) {
      console.error("[cron/brain-distill] client", clientId, e);
    }
  }

  // ── Phase 2: idle clients ──────────────────────────────────────────────
  // Clients with no pending feedback are never touched by Phase 1, so their
  // stale lessons would never decay and their Brain Score would never get a
  // fresh daily snapshot. Sweep the non-archived clients that don't yet have a
  // snapshot for today (and weren't just processed above) and run decay + score.
  let swept = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: allClients }, { data: snappedToday }] = await Promise.all([
      admin.from("clients").select("id").is("archived_at", null),
      admin.from("brain_score_history").select("client_id").eq("captured_date", today),
    ]);
    const snapped = new Set(((snappedToday ?? []) as { client_id: string }[]).map((r) => r.client_id));
    const justProcessed = new Set(clientIds);
    const idle = ((allClients ?? []) as { id: string }[])
      .map((c) => c.id)
      .filter((id) => !snapped.has(id) && !justProcessed.has(id))
      .slice(0, SNAPSHOT_BATCH);
    for (const cid of idle) {
      try {
        await decayClientMemory(admin, cid);
        await snapshotScore(admin, cid);
        swept++;
      } catch (e) {
        console.error("[cron/brain-distill] idle sweep", cid, e);
      }
    }
  } catch (e) {
    console.error("[cron/brain-distill] phase 2", e);
  }

  await beat({ clients: clientIds.length, memories: newMemories, swept });
  return NextResponse.json({ ok: true, clients: clientIds.length, processedSignals: processed, newMemories, sweptIdle: swept });
}

// Snapshot today's Brain Score (one row per client per day) and emit a
// "level up" journal event when the band increases vs the previous snapshot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function snapshotScore(admin: any, clientId: string) {
  const s = await computeBrainScore(admin, clientId);
  const { data: prev } = await admin
    .from("brain_score_history")
    .select("level, captured_date")
    .eq("client_id", clientId)
    .order("captured_date", { ascending: false })
    .limit(1);
  const prevLevel = (prev ?? [])[0]?.level as string | undefined;

  await admin.from("brain_score_history").upsert(
    { client_id: clientId, score: s.score, level: s.level, components: s.components },
    { onConflict: "client_id,captured_date" },
  );

  const order = ["Newborn", "Learning", "Sharp", "Expert", "Genius"];
  if (prevLevel && order.indexOf(s.level) > order.indexOf(prevLevel)) {
    await logBrainEvent(admin, clientId, "level_up", `Reached ${s.level} — your Brain is getting sharper 🎉`, { from: prevLevel, to: s.level, score: s.score });
  }
}
