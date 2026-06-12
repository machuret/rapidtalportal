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
  const { data: candidates } = await admin
    .from("vault_items")
    .select("id, client_id")
    .in("status", ["ready", "error"])
    .is("indexed_at", null)
    .order("updated_at", { ascending: true })
    .limit(SCAN_LIMIT);

  const rows = (candidates ?? []) as { id: string; client_id: string }[];
  // Heartbeat first: even a no-op run proves the cron is alive (/admin/health).
  const beat = (detail: Record<string, number>) =>
    admin.from("cron_heartbeats").upsert({ name: "vault-index", ran_at: new Date().toISOString(), detail });

  if (rows.length === 0) { await beat({ scanned: 0, indexed: 0 }); return NextResponse.json({ ok: true, scanned: 0, indexed: 0 }); }

  const todo = rows.slice(0, INDEX_LIMIT);
  if (todo.length === 0) { await beat({ scanned: rows.length, indexed: 0 }); return NextResponse.json({ ok: true, scanned: rows.length, indexed: 0 }); }

  // Re-index in small concurrent batches; tolerate individual failures.
  let done = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((r) => triggerVaultProcess(r.id, r.client_id)));
    done += results.filter((x) => x.status === "fulfilled").length;
  }

  await beat({ scanned: rows.length, candidates: todo.length, indexed: done });
  return NextResponse.json({ ok: true, scanned: rows.length, candidates: todo.length, indexed: done });
}
