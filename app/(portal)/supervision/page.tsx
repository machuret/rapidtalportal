import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExportCsv } from "@/components/supervision/ExportCsv";
import { PageIntro } from "@/components/layout/PageIntro";
import { Eye, Clock, ChevronRight, CheckCircle2, Target, Inbox, AlertTriangle, NotebookPen } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supervision — RapidTal" };

const WINDOW_DAYS = 30;

function hours(entries: { started_at: string; ended_at: string | null }[]): number {
  let ms = 0;
  for (const e of entries) if (e.ended_at) ms += new Date(e.ended_at).getTime() - new Date(e.started_at).getTime();
  return ms / 3_600_000;
}

export default async function SupervisionPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!["client_admin", "super_admin"].includes(user.role)) redirect("/dashboard");
  if (user.role === "client_admin" && !user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const isSuper = user.role === "super_admin";
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  // VAs in scope
  let vaQuery = admin.from("users").select("id, full_name, email, client_id").eq("role", "va");
  if (!isSuper) vaQuery = vaQuery.eq("client_id", user.client_id!);
  const { data: vaRows } = await vaQuery;
  const vas = (vaRows ?? []) as { id: string; full_name: string | null; email: string; client_id: string | null }[];
  const vaIds = vas.map((v) => v.id);

  const clientNames: Record<string, string> = {};
  if (isSuper && vas.some((v) => v.client_id)) {
    const { data: clients } = await admin.from("clients").select("id, name");
    for (const c of (clients ?? []) as { id: string; name: string }[]) clientNames[c.id] = c.name;
  }

  const [logsRes, timeRes, tasksRes] = vaIds.length
    ? await Promise.all([
        admin.from("daily_logs").select("user_id, log_date, updated_at").in("user_id", vaIds).gte("log_date", sinceDate),
        admin.from("time_entries").select("user_id, started_at, ended_at").in("user_id", vaIds).eq("phase", "work").gte("started_at", sinceIso),
        admin.from("tasks").select("assigned_to, status, updated_at, completed_at, due_date").in("assigned_to", vaIds).is("archived_at", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const logs = (logsRes.data ?? []) as { user_id: string; log_date: string; updated_at: string }[];
  const times = (timeRes.data ?? []) as { user_id: string; started_at: string; ended_at: string | null }[];
  const tasks = (tasksRes.data ?? []) as { assigned_to: string | null; status: string; updated_at: string; completed_at: string | null; due_date: string | null }[];

  // Outcome-first stats per VA.
  type Stat = {
    delivered: number; onTimeNum: number; onTimeDen: number; reviewing: number; inProgress: number;
    hours: number; logs: number; lastLog: string; lastActive: number;
  };
  const stats: Record<string, Stat> = {};
  const blank = (): Stat => ({ delivered: 0, onTimeNum: 0, onTimeDen: 0, reviewing: 0, inProgress: 0, hours: 0, logs: 0, lastLog: "", lastActive: 0 });
  const ensure = (id: string) => (stats[id] ??= blank());

  for (const l of logs) { const s = ensure(l.user_id); s.logs++; if (l.log_date > s.lastLog) s.lastLog = l.log_date; s.lastActive = Math.max(s.lastActive, new Date(l.updated_at).getTime()); }

  for (const t of tasks) {
    if (!t.assigned_to) continue;
    const s = ensure(t.assigned_to);
    if (t.status === "done") {
      if (t.completed_at && t.completed_at >= sinceIso) {
        s.delivered++;
        if (t.due_date) {
          s.onTimeDen++;
          if (new Date(t.completed_at).getTime() <= new Date(t.due_date + "T23:59:59").getTime()) s.onTimeNum++;
        }
      }
    } else if (t.status === "review") {
      s.reviewing++;
    } else {
      s.inProgress++;
    }
    s.lastActive = Math.max(s.lastActive, new Date(t.updated_at).getTime());
  }

  const timesByUser: Record<string, typeof times> = {};
  for (const t of times) { (timesByUser[t.user_id] ??= []).push(t); const s = ensure(t.user_id); s.lastActive = Math.max(s.lastActive, new Date(t.started_at).getTime()); }
  for (const [uid, ts] of Object.entries(timesByUser)) ensure(uid).hours = hours(ts);

  const onTimePct = (s: Stat) => (s.onTimeDen ? Math.round((s.onTimeNum / s.onTimeDen) * 100) : null);

  // Flags lead with the client's action item (work awaiting them), then VA hygiene.
  const today = new Date().toISOString().slice(0, 10);
  const daysBetween = (a: string, b: string) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
  const flagsFor = (id: string): { text: string; action?: boolean }[] => {
    const s = stats[id]; const f: { text: string; action?: boolean }[] = [];
    if (s && s.reviewing > 0) f.push({ text: `${s.reviewing} awaiting your review`, action: true });
    if (!s || !s.lastLog) f.push({ text: "No daily log this month" });
    else if (daysBetween(s.lastLog, today) >= 3) f.push({ text: `No log for ${daysBetween(s.lastLog, today)} days` });
    if (s && s.inProgress > 0 && s.delivered === 0) f.push({ text: "Active tasks, nothing delivered yet" });
    return f;
  };

  // Action items first, then most recently active.
  const sorted = [...vas].sort((a, b) => flagsFor(b.id).length - flagsFor(a.id).length || (stats[b.id]?.lastActive ?? 0) - (stats[a.id]?.lastActive ?? 0));

  const csvRows = sorted.map((va) => {
    const s = stats[va.id] ?? blank();
    return {
      name: va.full_name ?? va.email,
      email: va.email,
      ...(isSuper ? { client: va.client_id ? (clientNames[va.client_id] ?? "") : "" } : {}),
      delivered_30d: s.delivered,
      on_time_pct: onTimePct(s) ?? "",
      awaiting_review: s.reviewing,
      in_progress: s.inProgress,
      hours_worked: Number(s.hours.toFixed(1)),
      daily_logs: s.logs,
      last_log: s.lastLog || "never",
    };
  });

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Eye className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white tracking-tight">Supervision</h1>
          <p className="text-zinc-400 text-sm mt-1">What your team delivered — last {WINDOW_DAYS} days.</p>
        </div>
        <ExportCsv rows={csvRows} filename={`supervision-${new Date().toISOString().slice(0, 10)}.csv`} />
      </div>

      <PageIntro id="supervision" />

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-zinc-300 font-semibold mb-1">No VAs yet</p>
          <p className="text-zinc-500 text-sm">Assign VAs to {isSuper ? "clients" : "your team"} and their work shows up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((va) => {
            const s = stats[va.id] ?? blank();
            const pct = onTimePct(s);
            const flags = flagsFor(va.id);
            return (
              <Link key={va.id} href={`/supervision/${va.id}`}
                className="surface-card group block px-5 py-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-semibold text-zinc-300 shrink-0">
                    {(va.full_name ?? va.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-100">{va.full_name ?? va.email}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {isSuper && va.client_id && <>{clientNames[va.client_id] ?? "—"} · </>}
                      {s.lastActive ? `Active ${new Date(s.lastActive).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "No recent activity"}
                    </p>
                  </div>
                  {/* Outcomes first; hours are secondary context. */}
                  <div className="hidden sm:flex items-center gap-5 text-xs shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-zinc-200"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" />{s.delivered} delivered</span>
                    <span className="inline-flex items-center gap-1.5 text-zinc-200"><Target className="w-3.5 h-3.5 text-blue-400" />{pct === null ? "—" : `${pct}%`} on time</span>
                    {s.reviewing > 0 && <span className="inline-flex items-center gap-1.5 text-amber-300"><Inbox className="w-3.5 h-3.5" />{s.reviewing} for you</span>}
                    <span className="inline-flex items-center gap-1.5 text-zinc-500"><Clock className="w-3.5 h-3.5" />{s.hours.toFixed(1)}h</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
                </div>
                {flags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pl-14">
                    {flags.map((f) => (
                      <span key={f.text} className={f.action
                        ? "inline-flex items-center gap-1 text-[11px] font-medium text-blue-300 bg-blue-500/10 rounded-full px-2 py-0.5"
                        : "inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 rounded-full px-2 py-0.5"}>
                        {f.action ? <Inbox className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {f.text}
                      </span>
                    ))}
                  </div>
                )}
                {/* Mobile: a compact outcome line. */}
                <div className="sm:hidden flex items-center gap-4 mt-2 pl-14 text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" />{s.delivered}</span>
                  <span className="inline-flex items-center gap-1"><Target className="w-3 h-3 text-blue-400" />{pct === null ? "—" : `${pct}%`}</span>
                  <span className="inline-flex items-center gap-1"><NotebookPen className="w-3 h-3" />{s.logs}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
