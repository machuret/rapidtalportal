import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays } from "date-fns";
import Link from "next/link";
import Image from "next/image";
import { Users, NotebookPen, CalendarDays, Mail, Phone, ArrowRight, CheckCircle2, Target, Clock, AlertTriangle, Inbox } from "lucide-react";
import { TeamLeaveApprovals, type PendingLeave } from "@/components/team/TeamLeaveApprovals";
import { ExportCsv } from "@/components/team/ExportCsv";
import { moodMeta } from "@/lib/daily-logs/mood";
import { computeVaStats, blankVaStats, vaOnTimePct, vaFlags, type VaFlag } from "@/lib/va/stats";
import { timeAgo } from "@/lib/time";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";
import { FeatureReadyReporter } from "@/components/layout/FeatureReadyReporter";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Team — RapidTal" };

const STATS_WINDOW_DAYS = 30;

export default async function TeamPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ client?: string }> }) {
  const searchParams = await searchParamsPromise;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const isAdmin = user.role === "client_admin" || user.role === "super_admin";
  if (!isAdmin) redirect("/dashboard");

  const admin = createAdminClient();
  // Super admins have no client of their own — pick one (the old cross-tenant
  // supervision view they replaced). Same picker pattern as /brain.
  let clientId = user.client_id;
  let clientOptions: { id: string; name: string }[] = [];
  if (user.role === "super_admin") {
    const { data: clients, error: clientsError } = await admin
      .from("clients").select("id, name").is("archived_at", null).order("name");
    if (clientsError) throw new Error("Clients could not be loaded.", { cause: clientsError });
    clientOptions = (clients ?? []) as { id: string; name: string }[];
    const selected = clientOptions.find((option) => option.id === searchParams.client) ?? clientOptions[0];
    clientId = selected?.id ?? null;
  }
  if (!clientId) redirect("/dashboard");

  const since = format(subDays(new Date(), 6), "yyyy-MM-dd");

  // VAs and the client's pending leave are independent (both scoped by
  // client_id) — fetch together. The per-VA logs below need the VA ids, so they
  // follow.
  const [vasResult, leaveResult] = await withPortalDataTimeout((signal) => Promise.all([
    admin
      .from("users")
      .select("id, full_name, email, phone, birthday, avatar_url, created_at")
      .eq("client_id", clientId)
      .eq("role", "va")
      .order("full_name").abortSignal(signal),
    admin
      .from("va_leave_requests")
      .select("id, user_id, start_date, end_date, leave_type, reason, status")
      .eq("client_id", clientId)
      .eq("status", "pending")
      .order("start_date").abortSignal(signal),
  ]), "Team roster");
  if (vasResult.error || leaveResult.error) {
    throw new Error("Team information could not be loaded.", { cause: vasResult.error ?? leaveResult.error });
  }
  const vas = vasResult.data;
  const leaveRows = leaveResult.data;

  const vaList = vas ?? [];

  // Single batch query for all VAs — avoids N+1
  const vaIds = vaList.map(v => v.id);
  const [logsResult, stats] = await withPortalDataTimeout((signal) => Promise.all([
    vaIds.length > 0
      ? admin
          .from("daily_logs")
          .select("user_id, log_date, mood, tasks_done")
          .in("user_id", vaIds)
          .gte("log_date", since)
          .order("log_date", { ascending: false }).abortSignal(signal)
      : Promise.resolve({ data: [] }),
    // 30-day outcome stats (shared with the old Supervision page's formulas).
    computeVaStats(admin, vaIds, clientId, STATS_WINDOW_DAYS, signal),
  ]), "Team activity");
  if ("error" in logsResult && logsResult.error) {
    throw new Error("Team activity could not be loaded.", { cause: logsResult.error });
  }
  const allLogs = logsResult.data;

  const summaryMap: Record<string, { user_id: string; log_date: string; mood: string | null; tasks_done: string | null }[]> = {};
  for (const log of allLogs ?? []) {
    const l = log as { user_id: string; log_date: string; mood: string | null; tasks_done: string | null };
    if (!summaryMap[l.user_id]) summaryMap[l.user_id] = [];
    summaryMap[l.user_id].push(l);
  }

  const today = new Date().toISOString().slice(0, 10);
  const flagsFor = (id: string): VaFlag[] => vaFlags(stats[id], today);

  // Action items first, then alphabetical (the DB order) — a stable roster
  // where anyone needing attention floats to the top.
  const sorted = [...vaList].sort((a, b) => flagsFor(b.id).length - flagsFor(a.id).length);

  // Pending leave (fetched above with the VAs) — map to display names now that
  // we have both. (Relocated here from My Job, which is an employee page a
  // client shouldn't have to visit.)
  const nameById = new Map(vaList.map((v) => [v.id, v.full_name ?? v.email]));
  const pendingLeave: PendingLeave[] = ((leaveRows ?? []) as { id: string; user_id: string; start_date: string; end_date: string; leave_type: string | null; reason: string | null }[])
    .map((r) => ({ id: r.id, userName: nameById.get(r.user_id) ?? "VA", start_date: r.start_date, end_date: r.end_date, leave_type: r.leave_type, reason: r.reason }));

  // Same export the Supervision roster had, kept on the consolidated page.
  const csvRows = sorted.map((va) => {
    const s = stats[va.id] ?? blankVaStats();
    return {
      name: va.full_name ?? va.email,
      email: va.email,
      delivered_30d: s.delivered,
      on_time_pct: vaOnTimePct(s) ?? "",
      awaiting_review: s.reviewing,
      in_progress: s.inProgress,
      overdue: s.overdue,
      due_soon: s.dueSoon,
      hours_worked: Number(s.hours.toFixed(1)),
      daily_logs: s.logs,
      last_log: s.lastLog || "never",
    };
  });

  return (
    <div>
      <FeatureReadyReporter feature="team_workspace" />
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">My Team</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {vaList.length} VA{vaList.length !== 1 ? "s" : ""} · Outcomes, activity and profiles — last {STATS_WINDOW_DAYS} days
          </p>
        </div>
        <ExportCsv rows={csvRows} filename={`team-${new Date().toISOString().slice(0, 10)}.csv`} />
      </div>

      {user.role === "super_admin" && clientOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {clientOptions.map((option) => (
            <a
              key={option.id}
              href={`/team?client=${option.id}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                option.id === clientId
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600"
              }`}
            >
              {option.name}
            </a>
          ))}
        </div>
      )}

      <TeamLeaveApprovals initial={pendingLeave} />

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-16 text-center">
          <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-300 font-semibold text-lg mb-1">No VAs assigned yet</p>
          <p className="text-zinc-500 text-sm">VA accounts assigned to your client will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sorted.map(va => {
            const logs = summaryMap[va.id] ?? [];
            const s = stats[va.id] ?? blankVaStats();
            const pct = vaOnTimePct(s);
            const flags = flagsFor(va.id);
            const initials = (va.full_name ?? va.email)
              .split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();

            return (
              <Link
                key={va.id}
                href={`/team/${va.id}`}
                className="group block rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5 hover:border-zinc-600 hover:bg-zinc-800/60 transition-all"
              >
                <div className="flex items-center gap-5">
                  {/* Avatar */}
                  <div className="shrink-0">
                    {va.avatar_url ? (
                      <Image
                        src={va.avatar_url}
                        alt={va.full_name ?? ""}
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
                        {initials}
                      </div>
                    )}
                  </div>

                  {/* Name + contact */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-100 group-hover:text-white transition-colors">
                      {va.full_name ?? "—"}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Mail className="w-3 h-3" />
                        {va.email}
                      </span>
                      {va.phone && (
                        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <Phone className="w-3 h-3" />
                          {va.phone}
                        </span>
                      )}
                      {va.birthday && (
                        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <CalendarDays className="w-3 h-3" />
                          {va.birthday}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <NotebookPen className="w-3 h-3" />
                        Last log {s.lastLog ? timeAgo(s.lastLog) : "never"}
                      </span>
                    </div>
                  </div>

                  {/* Outcome stats (desktop) — outcomes first, hours secondary. */}
                  <div className="hidden md:flex items-center gap-5 text-xs shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-zinc-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />{s.delivered} delivered
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-zinc-200">
                      <Target className="w-3.5 h-3.5 text-blue-400" />{pct === null ? "—" : `${pct}%`} on time
                    </span>
                    {s.reviewing > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-amber-300">
                        <Inbox className="w-3.5 h-3.5" />{s.reviewing} for you
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-zinc-500">
                      <Clock className="w-3.5 h-3.5" />{s.hours.toFixed(1)}h
                    </span>
                  </div>

                  {/* 7-day mood strip */}
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <p className="text-xs text-zinc-600 font-medium">Last 7 days</p>
                    <div className="flex gap-1">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
                        const entry = logs.find((l: { log_date: string; mood: string | null }) => l.log_date === date);
                        return (
                          <div
                            key={date}
                            title={entry ? `${date}: ${entry.mood ?? "no mood"}` : date}
                            className={`w-5 h-5 rounded text-xs flex items-center justify-center ${
                              entry ? "bg-zinc-700" : "bg-zinc-800"
                            }`}
                          >
                            {entry?.mood ? moodMeta(entry.mood)?.emoji ?? "•" : (
                              <span className="text-zinc-700 text-3xs">–</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
                </div>

                {/* Flags lead with the most urgent signal. */}
                {flags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {flags.map((f) => (
                      <span key={f.text} className={
                        f.kind === "alert"
                          ? "inline-flex items-center gap-1 text-2xs font-medium text-red-300 bg-red-500/10 rounded-full px-2 py-0.5"
                          : f.kind === "action"
                            ? "inline-flex items-center gap-1 text-2xs font-medium text-blue-300 bg-blue-500/10 rounded-full px-2 py-0.5"
                            : "inline-flex items-center gap-1 text-2xs font-medium text-amber-300 bg-amber-500/10 rounded-full px-2 py-0.5"}>
                        {f.kind === "action" ? <Inbox className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {f.text}
                      </span>
                    ))}
                  </div>
                )}

                {/* Mobile: a compact outcome line. */}
                <div className="md:hidden flex items-center gap-4 mt-2 text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" />{s.delivered}</span>
                  <span className="inline-flex items-center gap-1"><Target className="w-3 h-3 text-blue-400" />{pct === null ? "—" : `${pct}%`}</span>
                  <span className="inline-flex items-center gap-1"><NotebookPen className="w-3 h-3" />{s.logs}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{s.hours.toFixed(1)}h</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
