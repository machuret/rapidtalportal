/**
 * Self-healing vault indexer, driven by Vercel Cron (see vercel.json).
 *
 * The inline index trigger (scheduleVaultProcess) is best-effort; this is the
 * guarantee. It finds items that are "ready"/"error" but have NO embedding
 * chunks — i.e. invisible to semantic search — and (re)indexes them by calling
 * the vault-process edge function, awaited, in small concurrent batches.
 *
 * The selection rules and batched multi-round loop live in
 * lib/vault/index-runner.ts, shared with POST /api/vault/index-batch (the
 * on-demand "index everything" button) so the two can never drift apart.
 *
 * Auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>` to cron requests.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runVaultIndexSweep } from "@/lib/vault/index-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // indexing N items can take a while

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { scanned, candidates, calls, remaining } = await runVaultIndexSweep(admin);

  // Heartbeat on every run: even a no-op proves the cron is alive
  // (/admin/health). `indexed` keeps its historical key name.
  await admin.from("cron_heartbeats").upsert({
    name: "vault-index",
    ran_at: new Date().toISOString(),
    detail: { scanned, candidates, indexed: calls, remaining },
  });

  return NextResponse.json({ ok: true, scanned, candidates, calls, remaining });
}
