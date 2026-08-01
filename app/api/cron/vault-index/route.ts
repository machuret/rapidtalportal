/**
 * Self-healing vault indexer, driven by Vercel Cron (see vercel.json).
 *
 * The inline index trigger (scheduleVaultProcess) is best-effort; this is the
 * guarantee. It finds items that are "ready"/"error" but have NO embedding
 * chunks — i.e. invisible to semantic search — and (re)indexes them by calling
 * the vault-process edge function, awaited, in small concurrent batches.
 *
 * Auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>` to cron requests.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerVaultProcess } from "@/lib/vault-process-trigger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // indexing N items can take a while

const SCAN_LIMIT = 400;   // candidates examined per run
const INDEX_LIMIT = 30;   // items actually (re)indexed per run
const CONCURRENCY = 4;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Candidate items: have content (ready/error) and aren't actively processing.
  // Candidates = ready/error docs not yet fully indexed. vault-process sets
  // indexed_at ONLY when every chunk is embedded, so `indexed_at IS NULL` covers
  // both never-indexed AND partially-indexed (resumed across runs) documents.
  // Oldest-touched first so nothing starves.
  // Also reclaim `processing` items stuck >20 min (edge isolate killed before
  // the ready write) — but dead-letter permanent failures after 24h of retries
  // so they stop crowding the queue for items that can succeed.
  const staleProcessingCutoff = new Date(Date.now() - 20 * 60_000).toISOString();
  const deadLetterCutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: candidates } = await admin
    .from("vault_items")
    .select("id, client_id, status, index_error, updated_at")
    .in("status", ["ready", "error", "processing"])
    .is("indexed_at", null)
    .or(`status.neq.processing,updated_at.lt.${staleProcessingCutoff}`)
    .order("updated_at", { ascending: true })
    .limit(SCAN_LIMIT);

  const rows = ((candidates ?? []) as { id: string; client_id: string; status: string; index_error: string | null; updated_at: string }[])
    .filter((row) => !(row.status === "error" && row.index_error && row.updated_at < deadLetterCutoff));
  // Heartbeat first: even a no-op run proves the cron is alive (/admin/health).
  const beat = (detail: Record<string, number>) =>
    admin.from("cron_heartbeats").upsert({ name: "vault-index", ran_at: new Date().toISOString(), detail });

  if (rows.length === 0) { await beat({ scanned: 0, indexed: 0 }); return NextResponse.json({ ok: true, scanned: 0, indexed: 0 }); }

  const todo = rows.slice(0, INDEX_LIMIT);
  if (todo.length === 0) { await beat({ scanned: rows.length, indexed: 0 }); return NextResponse.json({ ok: true, scanned: rows.length, indexed: 0 }); }

  // Multiple ROUNDS per sweep: each edge invocation gets a fresh CPU budget but
  // only manages a few embeddings before the runtime kills it (vault-process
  // banks progress in small batches). Re-triggering still-incomplete items
  // several times per sweep multiplies throughput, so a long manual finishes in
  // a couple of sweeps instead of a day. Between rounds we re-check indexed_at
  // so finished docs drop out.
  const ROUNDS = 4;
  let calls = 0;
  let remaining: { id: string; client_id: string }[] = todo;
  for (let round = 0; round < ROUNDS && remaining.length > 0; round++) {
    for (let i = 0; i < remaining.length; i += CONCURRENCY) {
      const batch = remaining.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map((r) => triggerVaultProcess(r.id, r.client_id)));
      calls += results.filter((x) => x.status === "fulfilled").length;
    }
    if (round < ROUNDS - 1) {
      const { data: still } = await admin
        .from("vault_items")
        .select("id, client_id")
        .in("id", remaining.map((r) => r.id))
        .is("indexed_at", null);
      remaining = (still ?? []) as { id: string; client_id: string }[];
    }
  }

  await beat({ scanned: rows.length, candidates: todo.length, indexed: calls });
  return NextResponse.json({ ok: true, scanned: rows.length, candidates: todo.length, calls });
}
