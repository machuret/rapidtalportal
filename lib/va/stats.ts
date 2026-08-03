/**
 * Per-VA outcome stats — the single computation behind the Team roster
 * (/team) and, during the consolidation, the legacy Supervision page. The
 * formulas themselves delegate to lib/tasks/metrics so every surface agrees
 * on "hours worked", "on time", "overdue" and "due soon".
 *
 * Extracted verbatim from the old supervision/page.tsx (which had just been
 * aligned to lib/tasks/metrics) — do not tweak the rules here without
 * checking every consumer.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import { sumWorkHours, isOnTime, isOverdue, isDueSoon, daysOverdue } from "@/lib/tasks/metrics";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Outcome-first stats for one VA over a rolling window. */
export interface VaStats {
  /** Tasks completed inside the window. */
  delivered: number;
  /** On-time numerator/denominator over delivered tasks that had a due date. */
  onTimeNum: number;
  onTimeDen: number;
  /** Live cards in `review` — delivered, awaiting the client's approval. */
  reviewing: number;
  /** Live cards still being worked (`todo`/`in_progress`). */
  inProgress: number;
  /** Working cards past their due date. */
  overdue: number;
  /** Working cards due within the proactive window (not yet overdue). */
  dueSoon: number;
  /** Worked hours (work-phase time entries) inside the window. */
  hours: number;
  /** Daily logs submitted inside the window. */
  logs: number;
  /** Latest `log_date` ('YYYY-MM-DD'), "" when the VA never logged in window. */
  lastLog: string;
  /** Epoch ms of the most recent log/task/time activity; 0 when none. */
  lastActive: number;
}

export interface VaFlag {
  text: string;
  kind: "alert" | "action" | "warn";
}

export function blankVaStats(): VaStats {
  return {
    delivered: 0, onTimeNum: 0, onTimeDen: 0, reviewing: 0, inProgress: 0,
    overdue: 0, dueSoon: 0, hours: 0, logs: 0, lastLog: "", lastActive: 0,
  };
}

/**
 * Compute per-VA stats for `vaIds` over the last `windowDays` days.
 *
 * `clientId` is an extra tenant filter on the data queries (defense in depth
 * on top of the caller's client-scoped VA list); pass null when computing
 * across tenants (super-admin). VAs with no activity in the window simply
 * have no entry — read with `stats[id] ?? blankVaStats()`.
 */
export async function computeVaStats(
  admin: AdminClient,
  vaIds: string[],
  clientId: string | null,
  windowDays: number,
): Promise<Record<string, VaStats>> {
  const stats: Record<string, VaStats> = {};
  if (vaIds.length === 0) return stats;
  const ensure = (id: string) => (stats[id] ??= blankVaStats());

  const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  let logsQuery = admin.from("daily_logs").select("user_id, log_date, updated_at").in("user_id", vaIds).gte("log_date", sinceDate);
  let timeQuery = admin.from("time_entries").select("user_id, started_at, ended_at").in("user_id", vaIds).eq("phase", "work").gte("started_at", sinceIso);
  // Live cards always count; done cards only inside the stats window —
  // the all-time non-archived history used to ride along forever.
  let tasksQuery = admin.from("tasks").select("assigned_to, status, updated_at, completed_at, due_date")
    .in("assigned_to", vaIds).is("archived_at", null)
    .or(`status.neq.done,completed_at.gte.${sinceIso}`);
  if (clientId) {
    logsQuery = logsQuery.eq("client_id", clientId);
    timeQuery = timeQuery.eq("client_id", clientId);
    tasksQuery = tasksQuery.eq("client_id", clientId);
  }

  const [logsRes, timeRes, tasksRes] = await Promise.all([logsQuery, timeQuery, tasksQuery]);
  const queryError = logsRes.error ?? timeRes.error ?? tasksRes.error;
  if (queryError) throw new Error("VA outcome statistics could not be loaded.", { cause: queryError });

  const logs = (logsRes.data ?? []) as { user_id: string; log_date: string; updated_at: string }[];
  const times = (timeRes.data ?? []) as { user_id: string; started_at: string; ended_at: string | null }[];
  const tasks = (tasksRes.data ?? []) as { assigned_to: string | null; status: string; updated_at: string; completed_at: string | null; due_date: string | null }[];

  for (const l of logs) {
    const s = ensure(l.user_id);
    s.logs++;
    if (l.log_date > s.lastLog) s.lastLog = l.log_date;
    s.lastActive = Math.max(s.lastActive, new Date(l.updated_at).getTime());
  }

  for (const t of tasks) {
    if (!t.assigned_to) continue;
    const s = ensure(t.assigned_to);
    if (t.status === "done") {
      if (t.completed_at && t.completed_at >= sinceIso) {
        s.delivered++;
        if (t.due_date) {
          s.onTimeDen++;
          if (isOnTime(t.completed_at, t.due_date)) s.onTimeNum++;
        }
      }
    } else if (t.status === "review") {
      s.reviewing++;
    } else {
      s.inProgress++;
      if (isOverdue(t, today)) s.overdue++;
      else if (isDueSoon(t, today)) s.dueSoon++;
    }
    s.lastActive = Math.max(s.lastActive, new Date(t.updated_at).getTime());
  }

  const timesByUser: Record<string, typeof times> = {};
  for (const t of times) {
    (timesByUser[t.user_id] ??= []).push(t);
    const s = ensure(t.user_id);
    s.lastActive = Math.max(s.lastActive, new Date(t.started_at).getTime());
  }
  for (const [uid, ts] of Object.entries(timesByUser)) ensure(uid).hours = sumWorkHours(ts);

  return stats;
}

/** On-time % over delivered tasks that had a due date; null when none (show "—"). */
export function vaOnTimePct(s: VaStats): number | null {
  return s.onTimeDen ? Math.round((s.onTimeNum / s.onTimeDen) * 100) : null;
}

/**
 * Flags lead with the most urgent signal — overdue work — then the client's
 * action item (work awaiting them), then VA hygiene. `today` is a
 * 'YYYY-MM-DD' local date, injectable for tests.
 */
export function vaFlags(s: VaStats | undefined, today: string): VaFlag[] {
  const f: VaFlag[] = [];
  if (s && s.overdue > 0) f.push({ text: `${s.overdue} overdue`, kind: "alert" });
  if (s && s.reviewing > 0) f.push({ text: `${s.reviewing} awaiting your review`, kind: "action" });
  if (s && s.dueSoon > 0) f.push({ text: `${s.dueSoon} due soon`, kind: "warn" });
  if (!s || !s.lastLog) f.push({ text: "No daily log this month", kind: "warn" });
  else if (daysOverdue(s.lastLog, today) >= 3) f.push({ text: `No log for ${daysOverdue(s.lastLog, today)} days`, kind: "warn" });
  if (s && s.inProgress > 0 && s.delivered === 0) f.push({ text: "Active tasks, nothing delivered yet", kind: "warn" });
  return f;
}
