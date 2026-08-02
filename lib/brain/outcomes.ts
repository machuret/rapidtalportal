/**
 * Reporting-only outcome measurement for the Brain analytics page.
 *
 * The Brain learns taste (👍/👎, edits) but deliberately NOT efficacy —
 * migration 091 rejects content-performance signals at the DB trigger level.
 * Nothing computed here feeds back into learning: these are read-only
 * aggregates over what already happened, shown to admins so they can judge
 * whether Coach actions and AI content actually worked.
 */
import { similarityRatio } from "./textdiff";

// ── Narrow row shapes (selected server-side, client-scoped, 90-day window) ──

export interface CoachReceiptRow {
  id: string;
  action_type: string;
  status: string; // processing | completed | failed
  owner_id: string;
  payload: unknown; // JSONB — create_task carries { title, brief, assigneeId?, ... }
  result: unknown; // JSONB | null — see linkReceiptToTask
  created_at: string;
}

export interface OutcomeTaskRow {
  id: string;
  title: string;
  status: string; // todo | in_progress | review | done
  created_by: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface KeptPieceRow {
  id: string;
  ai_original: string | null;
  body: string | null;
}

export interface OpportunityOutcomeRow {
  id: string;
  status: string; // suggested | approved | dismissed | in_progress | completed
  effectiveness_status: string; // unmeasured | measuring | effective | mixed | ineffective
}

// ── Coach action efficacy ────────────────────────────────────────────────────

export interface CreateTaskOutcome {
  /** Completed create_task receipts in the window. */
  completed: number;
  /** Of those, receipts we could link to a task row (direct or heuristic). */
  linked: number;
  /** Linked tasks now status='done'. */
  done: number;
  /** Median hours from task creation to completion (done, dated tasks only). */
  medianHoursToDone: number | null;
}

export interface CoachActionOutcomes {
  total: number;
  /** Per action_type: how many receipts and how they ended up. */
  byType: { type: string; completed: number; failed: number; processing: number }[];
  createTask: CreateTaskOutcome;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Link a completed create_task receipt to the task it created.
 *
 * Primary path: the execute_coach_action RPC (migration 137) writes
 * `result = {"taskId": <uuid>, "title": ...}` on success, so the link is
 * normally explicit.
 *
 * Fallback heuristic (defensive — for rows whose result is missing or
 * malformed): match a task created by the receipt's owner, whose title equals
 * the payload title (the RPC stores `left(btrim(title), 300)`), created within
 * ±60 seconds of the receipt. The RPC inserts the task in the same transaction
 * that completes the receipt, so same-minute is generous. When several tasks
 * match, the nearest in time wins.
 */
function linkReceiptToTask(receipt: CoachReceiptRow, tasks: OutcomeTaskRow[]): OutcomeTaskRow | null {
  const result = asObject(receipt.result);
  const taskId = typeof result?.taskId === "string" ? result.taskId : null;
  if (taskId) return tasks.find((t) => t.id === taskId) ?? null;

  const payload = asObject(receipt.payload);
  const title = typeof payload?.title === "string" ? payload.title.trim().slice(0, 300) : null;
  if (!title) return null;
  const receiptTs = new Date(receipt.created_at).getTime();
  let best: OutcomeTaskRow | null = null;
  let bestDelta = Infinity;
  for (const task of tasks) {
    if (task.created_by !== receipt.owner_id || task.title !== title || !task.created_at) continue;
    const delta = Math.abs(new Date(task.created_at).getTime() - receiptTs);
    if (delta <= 60_000 && delta < bestDelta) {
      best = task;
      bestDelta = delta;
    }
  }
  return best;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeCoachActionOutcomes(
  receipts: CoachReceiptRow[],
  tasks: OutcomeTaskRow[],
): CoachActionOutcomes {
  const byTypeMap = new Map<string, { completed: number; failed: number; processing: number }>();
  for (const r of receipts) {
    const bucket = byTypeMap.get(r.action_type) ?? { completed: 0, failed: 0, processing: 0 };
    if (r.status === "completed") bucket.completed++;
    else if (r.status === "failed") bucket.failed++;
    else bucket.processing++;
    byTypeMap.set(r.action_type, bucket);
  }

  const created = receipts.filter((r) => r.action_type === "create_task" && r.status === "completed");
  let linked = 0;
  let done = 0;
  const hoursToDone: number[] = [];
  for (const receipt of created) {
    const task = linkReceiptToTask(receipt, tasks);
    if (!task) continue;
    linked++;
    if (task.status === "done") {
      done++;
      if (task.created_at && task.completed_at) {
        const hours = (new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 3_600_000;
        if (hours >= 0) hoursToDone.push(hours);
      }
    }
  }

  return {
    total: receipts.length,
    byType: Array.from(byTypeMap.entries())
      .map(([type, counts]) => ({ type, ...counts }))
      .sort((a, b) => b.completed + b.failed + b.processing - (a.completed + a.failed + a.processing)),
    createTask: {
      completed: created.length,
      linked,
      done,
      medianHoursToDone: median(hoursToDone),
    },
  };
}

// ── Content kept-ratio ───────────────────────────────────────────────────────

export interface ContentKeptStats {
  /** Approved pieces that have a captured AI draft (ai_original). */
  pieces: number;
  /** Average word-level similarity between the AI draft and the approved body.
   *  100 = approved untouched, 0 = rewritten from scratch. Null when no pieces. */
  avgKeptPct: number | null;
}

export function computeContentKept(pieces: KeptPieceRow[]): ContentKeptStats {
  const comparable = pieces.filter((p) => p.ai_original && p.body);
  if (comparable.length === 0) return { pieces: 0, avgKeptPct: null };
  const total = comparable.reduce((sum, p) => sum + similarityRatio(p.ai_original as string, p.body as string), 0);
  return { pieces: comparable.length, avgKeptPct: Math.round((total / comparable.length) * 100) };
}

// ── Opportunity effectiveness ────────────────────────────────────────────────

export const EFFECTIVENESS_BUCKETS = ["unmeasured", "measuring", "effective", "mixed", "ineffective"] as const;

export interface OpportunityEffectiveness {
  total: number;
  completed: number;
  distribution: { status: string; count: number }[];
}

export function computeOpportunityEffectiveness(rows: OpportunityOutcomeRow[]): OpportunityEffectiveness {
  const counts = new Map<string, number>(EFFECTIVENESS_BUCKETS.map((b) => [b, 0]));
  for (const row of rows) {
    counts.set(row.effectiveness_status, (counts.get(row.effectiveness_status) ?? 0) + 1);
  }
  return {
    total: rows.length,
    completed: rows.filter((r) => r.status === "completed").length,
    distribution: EFFECTIVENESS_BUCKETS.map((status) => ({ status, count: counts.get(status) ?? 0 })),
  };
}
