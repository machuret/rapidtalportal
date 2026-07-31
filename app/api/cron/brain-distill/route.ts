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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CLIENTS_PER_RUN = 25;
// Idle clients still get daily decay. Brain Readiness is calculated live from
// demonstrated capability, so the cron no longer writes an opaque score.
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

  // Phase 1: clients with new feedback → distil and mark maintenance.
  let newMemories = 0;
  let processed = 0;
  let failures = 0;
  for (const clientId of clientIds) {
    try {
      const r = await distillClientMemory(admin, clientId);
      newMemories += r.newMemories;
      processed += r.processedSignals;
      await markMaintained(admin, clientId);
    } catch (e) {
      failures++;
      console.error("[cron/brain-distill] client", clientId, e);
    }
  }

  // ── Phase 2: idle clients ──────────────────────────────────────────────
  // Clients with no pending feedback are never touched by Phase 1, so their
  // stale lessons would never decay. Sweep non-archived clients that have not
  // been maintained today.
  let swept = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: allClients }, { data: maintainedToday }] = await Promise.all([
      admin.from("clients").select("id").is("archived_at", null),
      admin.from("brain_maintenance_state").select("client_id").gte("last_decay_at", `${today}T00:00:00.000Z`),
    ]);
    const maintained = new Set(((maintainedToday ?? []) as { client_id: string }[]).map((r) => r.client_id));
    const justProcessed = new Set(clientIds);
    const idle = ((allClients ?? []) as { id: string }[])
      .map((c) => c.id)
      .filter((id) => !maintained.has(id) && !justProcessed.has(id))
      .slice(0, SNAPSHOT_BATCH);
    for (const cid of idle) {
      try {
        await decayClientMemory(admin, cid);
        await markMaintained(admin, cid);
        swept++;
      } catch (e) {
        console.error("[cron/brain-distill] idle sweep", cid, e);
      }
    }
  } catch (e) {
    console.error("[cron/brain-distill] phase 2", e);
  }

  await beat({ clients: clientIds.length, memories: newMemories, swept, failures });
  return NextResponse.json(
    {
      ok: failures === 0,
      clients: clientIds.length,
      processedSignals: processed,
      newMemories,
      sweptIdle: swept,
      failures,
    },
    { status: failures > 0 ? 500 : 200 },
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markMaintained(admin: any, clientId: string) {
  const { error } = await admin.from("brain_maintenance_state").upsert(
    {
      client_id: clientId,
      last_decay_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" },
  );
  if (error) throw new Error(error.message);
}
