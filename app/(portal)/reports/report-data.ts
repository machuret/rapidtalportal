import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { onTimePct, workHours, type TimeRange } from "@/lib/tasks/metrics";

export interface ReportVARow { name: string; delivered: number; onTimePct: number | null; hours: number }
export interface ReportCatRow { name: string; color: string; count: number }
export interface ReportDeliveredItem { title: string; completedAt: string; vaName: string | null; category: string | null }
export interface ReportTotals { delivered: number; requested: number; hours: number; onTimePct: number | null; content: number; toolRuns: number }

export interface ClientReportData {
  clientName: string;
  monthKey: string;
  monthLabel: string;
  months: { key: string; label: string }[];
  totals: ReportTotals;
  /** Same headline totals for the prior month, for month-over-month deltas. */
  prevTotals: ReportTotals;
  prevMonthLabel: string;
  vaRows: ReportVARow[];
  categories: ReportCatRow[];
  delivered: ReportDeliveredItem[];
  generatedAt: string;
}

/** The 'YYYY-MM' month immediately before the given one. */
export function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Headline totals for one month — used for the prior-month comparison. */
async function monthTotals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  clientId: string,
  monthKey: string,
  signal?: AbortSignal,
): Promise<ReportTotals> {
  const [y, m] = monthKey.split("-").map(Number);
  const startIso = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const nextIso = new Date(Date.UTC(y, m, 1)).toISOString();
  const startDate = startIso.slice(0, 10);
  const nextDate = nextIso.slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const abort = (query: any) => signal ? query.abortSignal(signal) : query;
  const [doneResult, requestedResult, timeResult, contentResult, toolRunsResult] = await Promise.all([
    abort(admin.from("tasks").select("completed_at, due_date").eq("client_id", clientId).eq("status", "done").gte("completed_at", startIso).lt("completed_at", nextIso)),
    abort(admin.from("tasks").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso)),
    abort(admin.from("time_entries").select("started_at, ended_at").eq("client_id", clientId).eq("phase", "work").gte("work_date", startDate).lt("work_date", nextDate)),
    abort(admin.from("content_pieces").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso)),
    abort(admin.from("tool_runs").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso)),
  ]);
  const queryError = doneResult.error ?? requestedResult.error ?? timeResult.error ?? contentResult.error ?? toolRunsResult.error;
  if (queryError) throw new Error("Monthly comparison data could not be loaded.", { cause: queryError });
  const doneRows = doneResult.data;
  const requested = requestedResult.count;
  const timeRows = timeResult.data;
  const content = contentResult.count;
  const toolRuns = toolRunsResult.count;

  const tasks = (doneRows ?? []) as { completed_at: string | null; due_date: string | null }[];
  return {
    delivered: tasks.length,
    requested: requested ?? 0,
    hours: workHours((timeRows ?? []) as TimeRange[]),
    onTimePct: onTimePct(tasks),
    content: content ?? 0,
    toolRuns: toolRuns ?? 0,
  };
}

const labelOf = (key: string) =>
  new Date(key + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** The last `n` months as { key:'YYYY-MM', label:'June 2026' }, newest first. */
export function recentMonths(n = 6): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  // Anchor month arithmetic to the first. Subtracting from dates such as
  // 30/31 can roll through short months and produce duplicate options.
  d.setUTCDate(1);
  for (let i = 0; i < n; i++) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: labelOf(key) });
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

interface TaskRow { title: string; status: string; assigned_to: string | null; completed_at: string | null; due_date: string | null; category_id: string | null }

export async function buildClientReport(clientId: string, clientName: string, monthKey: string, signal?: AbortSignal): Promise<ClientReportData> {
  const admin = createAdminClient();
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const startIso = start.toISOString();
  const nextIso = next.toISOString();
  const startDate = startIso.slice(0, 10);
  const nextDate = nextIso.slice(0, 10);
  // Prior-month headline totals for the month-over-month comparison — the key
  // is known up front, so it runs in the same batch as the main-month queries.
  const prevKey = previousMonthKey(monthKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const abort = (query: any) => signal ? query.abortSignal(signal) : query;
  const [vaResult, categoriesResult, deliveredResult, requestedResult, timeResult, contentResult, toolRunsResult, prevTotals] = await Promise.all([
    abort(admin.from("users").select("id, full_name, email").eq("client_id", clientId).eq("role", "va")),
    abort(admin.from("task_categories").select("id, name, color").eq("client_id", clientId)),
    abort(admin.from("tasks").select("title, status, assigned_to, completed_at, due_date, category_id")
      .eq("client_id", clientId).eq("status", "done").gte("completed_at", startIso).lt("completed_at", nextIso)),
    abort(admin.from("tasks").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso)),
    abort(admin.from("time_entries").select("user_id, started_at, ended_at").eq("client_id", clientId).eq("phase", "work")
      .gte("work_date", startDate).lt("work_date", nextDate)),
    abort(admin.from("content_pieces").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso)),
    abort(admin.from("tool_runs").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso)),
    monthTotals(admin, clientId, prevKey, signal),
  ]);
  const queryError = vaResult.error ?? categoriesResult.error ?? deliveredResult.error
    ?? requestedResult.error ?? timeResult.error ?? contentResult.error ?? toolRunsResult.error;
  if (queryError) throw new Error("Monthly report data could not be loaded.", { cause: queryError });
  const vaRows = vaResult.data;
  const cats = categoriesResult.data;
  const deliveredRows = deliveredResult.data;
  const requested = requestedResult.count;
  const timeRows = timeResult.data;
  const content = contentResult.count;
  const toolRuns = toolRunsResult.count;

  const vaName = new Map(((vaRows ?? []) as { id: string; full_name: string | null; email: string }[]).map((v) => [v.id, v.full_name ?? v.email]));
  const catById = new Map(((cats ?? []) as { id: string; name: string; color: string }[]).map((c) => [c.id, c]));
  const tasks = (deliveredRows ?? []) as TaskRow[];

  // Totals + per-VA + per-category.
  const perVATasks = new Map<string, TaskRow[]>();
  const perVAEntries = new Map<string, TimeRange[]>();
  const perCat = new Map<string, number>();
  const pushTo = <T,>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const t of tasks) {
    if (t.assigned_to) pushTo(perVATasks, t.assigned_to, t);
    const key = t.category_id ?? "__none__";
    perCat.set(key, (perCat.get(key) ?? 0) + 1);
  }

  const entries = (timeRows ?? []) as ({ user_id: string } & TimeRange)[];
  for (const e of entries) {
    if (e.user_id) pushTo(perVAEntries, e.user_id, e);
  }

  // A VA appears if they delivered anything OR logged any time this month.
  const vaIds = new Set([...perVATasks.keys(), ...perVAEntries.keys()]);
  const vaRowsOut: ReportVARow[] = Array.from(vaIds)
    .map((id) => ({
      name: vaName.get(id) ?? "VA",
      delivered: perVATasks.get(id)?.length ?? 0,
      onTimePct: onTimePct(perVATasks.get(id) ?? []),
      hours: workHours(perVAEntries.get(id) ?? []),
    }))
    .sort((a, b) => b.delivered - a.delivered);

  const categories: ReportCatRow[] = Array.from(perCat.entries())
    .map(([key, count]) => {
      const c = key === "__none__" ? null : catById.get(key);
      return { name: c?.name ?? "Uncategorised", color: c?.color ?? "zinc", count };
    })
    .sort((a, b) => b.count - a.count);

  const delivered: ReportDeliveredItem[] = [...tasks]
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 40)
    .map((t) => ({ title: t.title, completedAt: t.completed_at ?? "", vaName: t.assigned_to ? vaName.get(t.assigned_to) ?? null : null, category: t.category_id ? catById.get(t.category_id)?.name ?? null : null }));

  return {
    clientName,
    monthKey,
    monthLabel: labelOf(monthKey),
    months: recentMonths(6),
    totals: {
      delivered: tasks.length,
      requested: requested ?? 0,
      hours: workHours(entries),
      onTimePct: onTimePct(tasks),
      content: content ?? 0,
      toolRuns: toolRuns ?? 0,
    },
    prevTotals,
    prevMonthLabel: labelOf(prevKey),
    vaRows: vaRowsOut,
    categories,
    delivered,
    generatedAt: new Date().toISOString(),
  };
}
