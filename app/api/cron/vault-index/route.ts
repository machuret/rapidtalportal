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
  // Oldest-touched first so nothing starves. We over-scan, then filter to those
  // genuinely missing chunks.
  const { data: candidates } = await admin
    .from("vault_items")
    .select("id, client_id")
    .in("status", ["ready", "error"])
    .order("updated_at", { ascending: true })
    .limit(SCAN_LIMIT);

  const rows = (candidates ?? []) as { id: string; client_id: string }[];
  if (rows.length === 0) return NextResponse.json({ ok: true, scanned: 0, indexed: 0 });

  // Which already have embeddings? One query, then set membership.
  const { data: chunked } = await admin
    .from("vault_chunks")
    .select("item_id")
    .in("item_id", rows.map((r) => r.id));
  const indexed = new Set((chunked ?? []).map((c) => (c as { item_id: string }).item_id));

  const todo = rows.filter((r) => !indexed.has(r.id)).slice(0, INDEX_LIMIT);
  if (todo.length === 0) return NextResponse.json({ ok: true, scanned: rows.length, indexed: 0 });

  // Re-index in small concurrent batches; tolerate individual failures.
  let done = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((r) => triggerVaultProcess(r.id, r.client_id)));
    done += results.filter((x) => x.status === "fulfilled").length;
  }

  return NextResponse.json({ ok: true, scanned: rows.length, candidates: todo.length, indexed: done });
}
