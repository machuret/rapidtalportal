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
import { distillClientMemory } from "@/lib/brain/distill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CLIENTS_PER_RUN = 25;

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

  if (clientIds.length === 0) {
    await beat({ clients: 0, memories: 0 });
    return NextResponse.json({ ok: true, clients: 0, memories: 0 });
  }

  let newMemories = 0;
  let processed = 0;
  for (const clientId of clientIds) {
    try {
      const r = await distillClientMemory(admin, clientId);
      newMemories += r.newMemories;
      processed += r.processedSignals;
    } catch (e) {
      console.error("[cron/brain-distill] client", clientId, e);
    }
  }

  await beat({ clients: clientIds.length, memories: newMemories });
  return NextResponse.json({ ok: true, clients: clientIds.length, processedSignals: processed, newMemories });
}
