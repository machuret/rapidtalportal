import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, NotebookPen, Clock, ListChecks, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const MOOD_LABEL: Record<string, string> = {
  great: "😄 Great", good: "🙂 Good", neutral: "😐 Neutral", difficult: "😕 Difficult", overwhelmed: "😩 Overwhelmed",
};

function hours(entries: { started_at: string; ended_at: string | null }[]): number {
  let ms = 0;
  for (const e of entries) if (e.ended_at) ms += new Date(e.ended_at).getTime() - new Date(e.started_at).getTime();
  return ms / 3_600_000;
}

export default async function SupervisionDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!["client_admin", "super_admin"].includes(user.role)) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: targetRow } = await admin
    .from("users")
    .select("id, full_name, email, role, client_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!targetRow) notFound();
  const va = targetRow as { id: string; full_name: string | null; email: string; role: string; client_id: string | null };

  // Access: super_admin sees anyone; client_admin only their own client's people.
  if (user.role !== "super_admin" && va.client_id !== user.client_id) notFound();

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const [logsRes, timeRes, runsRes] = await Promise.all([
    admin.from("daily_logs").select("log_date, mood, tasks_done, admin_feedback, reviewed_at, updated_at")
      .eq("user_id", va.id).gte("log_date", sinceDate).order("log_date", { ascending: false }).limit(15),
    admin.from("time_entries").select("started_at, ended_at")
      .eq("user_id", va.id).eq("phase", "work").gte("started_at", sinceIso),
    admin.from("sop_runs").select("sop_id, status, steps_done, steps_total, created_at")
      .eq("user_id", va.id).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(15),
  ]);

  const logs = (logsRes.data ?? []) as { log_date: string; mood: string | null; tasks_done: string; admin_feedback: string | null; reviewed_at: string | null }[];
  const times = (timeRes.data ?? []) as { started_at: string; ended_at: string | null }[];
  const runs = (runsRes.data ?? []) as { sop_id: string; status: string; steps_done: number; steps_total: number; created_at: string }[];

  // SOP titles for the runs
  const sopTitles: Record<string, string> = {};
  const runSopIds = Array.from(new Set(runs.map((r) => r.sop_id)));
  if (runSopIds.length) {
    const { data: sopRows } = await admin.from("sops").select("id, title").in("id", runSopIds);
    for (const s of (sopRows ?? []) as { id: string; title: string }[]) sopTitles[s.id] = s.title;
  }

  const totalHours = hours(times);
  const completed = runs.filter((r) => r.status === "completed").length;

  return (
    <div className="max-w-3xl">
      <Link href="/supervision" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Supervision
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-semibold text-zinc-200 shrink-0">
          {(va.full_name ?? va.email).slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{va.full_name ?? va.email}</h1>
          <p className="text-zinc-500 text-sm">{va.email} · last {WINDOW_DAYS} days</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Stat icon={NotebookPen} tint="text-blue-400" label="Daily logs" value={String(logs.length)} />
        <Stat icon={Clock} tint="text-green-400" label="Hours worked" value={`${totalHours.toFixed(1)}h`} />
        <Stat icon={ListChecks} tint="text-amber-400" label="SOPs run" value={String(runs.length)} />
        <Stat icon={CheckCircle2} tint="text-purple-400" label="SOPs completed" value={String(completed)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily logs */}
        <section className="surface-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent daily logs</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-500">No logs in this period.</p>
          ) : (
            <ul className="space-y-3">
              {logs.map((l) => (
                <li key={l.log_date} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">
                      {new Date(l.log_date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {l.mood ? MOOD_LABEL[l.mood] ?? l.mood : ""}
                      {l.reviewed_at && <span className="ml-2 text-green-400">reviewed</span>}
                    </span>
                  </div>
                  {l.tasks_done?.trim() && <p className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-wrap">{l.tasks_done}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* SOP runs */}
        <section className="surface-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent SOP runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-zinc-500">No SOPs run in this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {runs.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  {r.status === "completed"
                    ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                    : <ListChecks className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{sopTitles[r.sop_id] ?? "Untitled SOP"}</p>
                    <p className="text-xs text-zinc-500">
                      {r.status === "completed" ? "Completed" : `${r.steps_done}/${r.steps_total} steps`}
                      {" · "}{new Date(r.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, tint, label, value }: { icon: typeof Clock; tint: string; label: string; value: string }) {
  return (
    <div className="surface-card px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 shrink-0 ${tint}`} />
        <span className="label-section">{label}</span>
      </div>
      <p className="stat-value text-white">{value}</p>
    </div>
  );
}
