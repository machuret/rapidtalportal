/**
 * Shared "index the unindexed" sweep.
 *
 * Extracted from /api/cron/vault-index so the on-demand "index everything"
 * button (POST /api/vault/index-batch) runs the exact same candidate selection
 * and batching server-side instead of looping /reprocess calls in the browser
 * (which silently aborted on navigation). The cron calls this unscoped (global
 * backstop, every 15 min); the route scopes it to one authorised client.
 */
import { triggerVaultProcess } from "@/lib/vault-process-trigger";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const SCAN_LIMIT = 400;   // candidates examined per run
const INDEX_LIMIT = 30;   // items actually (re)indexed per run
const CONCURRENCY = 4;
const ROUNDS = 4;

interface IndexCandidateRow {
  id: string;
  client_id: string;
  status: string;
  index_error: string | null;
  updated_at: string;
}

export interface VaultIndexSweepOptions {
  /** Restrict the sweep to one tenant (the on-demand route). Omit for the cron. */
  clientId?: string;
  scanLimit?: number;
  indexLimit?: number;
  rounds?: number;
}

export interface VaultIndexSweepResult {
  scanned: number;     // candidate rows left after dead-letter filtering
  candidates: number;  // items selected for (re)indexing this run
  calls: number;       // fulfilled vault-process invocations across all rounds
  remaining: number;   // selected items still unindexed after the final round
}

/** Items from `ids` whose indexing still hasn't completed. */
async function stillUnindexed(
  admin: AdminClient,
  ids: string[],
): Promise<{ id: string; client_id: string }[]> {
  if (ids.length === 0) return [];
  const { data } = await admin
    .from("vault_items")
    .select("id, client_id")
    .in("id", ids)
    .is("indexed_at", null);
  return (data ?? []) as { id: string; client_id: string }[];
}

export async function runVaultIndexSweep(
  admin: AdminClient,
  opts: VaultIndexSweepOptions = {},
): Promise<VaultIndexSweepResult> {
  const {
    clientId,
    scanLimit = SCAN_LIMIT,
    indexLimit = INDEX_LIMIT,
    rounds = ROUNDS,
  } = opts;

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
  let query = admin
    .from("vault_items")
    .select("id, client_id, status, index_error, updated_at")
    .in("status", ["ready", "error", "processing"])
    .is("indexed_at", null);
  if (clientId) query = query.eq("client_id", clientId);
  const { data: candidates } = await query
    .or(`status.neq.processing,updated_at.lt.${staleProcessingCutoff}`)
    .order("updated_at", { ascending: true })
    .limit(scanLimit);

  const rows = ((candidates ?? []) as IndexCandidateRow[])
    .filter((row) => !(row.status === "error" && row.index_error && row.updated_at < deadLetterCutoff));

  if (rows.length === 0) return { scanned: 0, candidates: 0, calls: 0, remaining: 0 };

  const todo = rows.slice(0, indexLimit);

  // Multiple ROUNDS per sweep: each edge invocation gets a fresh CPU budget but
  // only manages a few embeddings before the runtime kills it (vault-process
  // banks progress in small batches). Re-triggering still-incomplete items
  // several times per sweep multiplies throughput, so a long manual finishes in
  // a couple of sweeps instead of a day. Between rounds we re-check indexed_at
  // so finished docs drop out.
  let calls = 0;
  let remaining: { id: string; client_id: string }[] = todo;
  for (let round = 0; round < rounds && remaining.length > 0; round++) {
    for (let i = 0; i < remaining.length; i += CONCURRENCY) {
      const batch = remaining.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map((r) => triggerVaultProcess(r.id, r.client_id)));
      calls += results.filter((x) => x.status === "fulfilled").length;
    }
    if (round < rounds - 1) {
      remaining = await stillUnindexed(admin, remaining.map((r) => r.id));
    }
  }

  // One final re-check so `remaining` reflects the state after the last round —
  // the on-demand route reports it, and the cron heartbeat surfaces it.
  const left = await stillUnindexed(admin, remaining.map((r) => r.id));

  return { scanned: rows.length, candidates: todo.length, calls, remaining: left.length };
}
