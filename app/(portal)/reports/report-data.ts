import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ReportVARow { name: string; delivered: number; onTimePct: number | null; hours: number }
export interface ReportCatRow { name: string; color: string; count: number }
export interface ReportDeliveredItem { title: string; completedAt: string; vaName: string | null; category: string | null }

export interface ClientReportData {
  clientName: string;
  monthKey: string;
  monthLabel: string;
  months: { key: string; label: string }[];
  totals: { delivered: number; requested: number; hours: number; onTimePct: number | null; content: number; toolRuns: number };
  vaRows: ReportVARow[];
  categories: ReportCatRow[];
  delivered: ReportDeliveredItem[];
  generatedAt: string;
}

const labelOf = (key: string) =>
  new Date(key + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** The last `n` months as { key:'YYYY-MM', label:'June 2026' }, newest first. */
export function recentMonths(n = 6): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: labelOf(key) });
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

interface TaskRow { title: string; status: string; assigned_to: string | null; completed_at: string | null; due_date: string | null; category_id: string | null }

export async function buildClientReport(clientId: string, clientName: string, monthKey: string): Promise<ClientReportData> {
  const admin = createAdminClient();
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const startIso = start.toISOString();
  const nextIso = next.toISOString();
  const startDate = startIso.slice(0, 10);
  const nextDate = nextIso.slice(0, 10);

  const [{ data: vaRows }, { data: cats }, { data: deliveredRows }, { count: requested }, { data: timeRows }, { count: content }, { count: toolRuns }] = await Promise.all([
    admin.from("users").select("id, full_name, email").eq("client_id", clientId).eq("role", "va"),
    admin.from("task_categories").select("id, name, color").eq("client_id", clientId),
    admin.from("tasks").select("title, status, assigned_to, completed_at, due_date, category_id")
      .eq("client_id", clientId).eq("status", "done").gte("completed_at", startIso).lt("completed_at", nextIso),
    admin.from("tasks").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso),
    admin.from("time_entries").select("user_id, started_at, ended_at").eq("client_id", clientId).eq("phase", "work")
      .gte("work_date", startDate).lt("work_date", nextDate),
    admin.from("content_pieces").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso),
    admin.from("tool_runs").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("created_at", startIso).lt("created_at", nextIso),
  ]);

  const vaName = new Map(((vaRows ?? []) as { id: string; full_name: string | null; email: string }[]).map((v) => [v.id, v.full_name ?? v.email]));
  const catById = new Map(((cats ?? []) as { id: string; name: string; color: string }[]).map((c) => [c.id, c]));
  const tasks = (deliveredRows ?? []) as TaskRow[];

  // Totals + per-VA + per-category.
  let onTimeNum = 0, onTimeDen = 0;
  const perVA = new Map<string, { delivered: number; onNum: number; onDen: number; hours: number }>();
  const perCat = new Map<string, number>();
  const ensureVA = (id: string) => perVA.get(id) ?? perVA.set(id, { delivered: 0, onNum: 0, onDen: 0, hours: 0 }).get(id)!;

  for (const t of tasks) {
    if (t.assigned_to) { const v = ensureVA(t.assigned_to); v.delivered++; }
    if (t.due_date && t.completed_at) {
      const onTime = new Date(t.completed_at).getTime() <= new Date(t.due_date + "T23:59:59").getTime();
      onTimeDen++; if (onTime) onTimeNum++;
      if (t.assigned_to) { const v = ensureVA(t.assigned_to); v.onDen++; if (onTime) v.onNum++; }
    }
    const key = t.category_id ?? "__none__";
    perCat.set(key, (perCat.get(key) ?? 0) + 1);
  }

  // Hours per VA + total.
  let hoursMs = 0;
  for (const e of (timeRows ?? []) as { user_id: string; started_at: string; ended_at: string | null }[]) {
    if (!e.ended_at) continue;
    const ms = new Date(e.ended_at).getTime() - new Date(e.started_at).getTime();
    hoursMs += ms;
    if (e.user_id) { const v = ensureVA(e.user_id); v.hours += ms; }
  }

  const round1 = (ms: number) => Math.round(ms / 360_000) / 10;
  const vaRowsOut: ReportVARow[] = Array.from(perVA.entries())
    .map(([id, v]) => ({ name: vaName.get(id) ?? "VA", delivered: v.delivered, onTimePct: v.onDen ? Math.round((v.onNum / v.onDen) * 100) : null, hours: round1(v.hours) }))
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
      hours: round1(hoursMs),
      onTimePct: onTimeDen ? Math.round((onTimeNum / onTimeDen) * 100) : null,
      content: content ?? 0,
      toolRuns: toolRuns ?? 0,
    },
    vaRows: vaRowsOut,
    categories,
    delivered,
    generatedAt: new Date().toISOString(),
  };
}
