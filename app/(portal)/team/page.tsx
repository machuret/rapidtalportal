import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays } from "date-fns";
import Link from "next/link";
import Image from "next/image";
import { Users, NotebookPen, CalendarDays, Mail, Phone, ArrowRight } from "lucide-react";
import { TeamLeaveApprovals, type PendingLeave } from "@/components/team/TeamLeaveApprovals";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Team — RapidTal" };

const MOOD_EMOJI: Record<string, string> = {
  great: "🟢", good: "🔵", neutral: "🟡", difficult: "🟠", overwhelmed: "🔴",
};

export default async function TeamPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const isAdmin = user.role === "client_admin" || user.role === "super_admin";
  if (!isAdmin || !user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const since = format(subDays(new Date(), 6), "yyyy-MM-dd");

  const { data: vas } = await admin
    .from("users")
    .select("id, full_name, email, phone, birthday, avatar_url, created_at")
    .eq("client_id", user.client_id)
    .eq("role", "va")
    .order("full_name");

  const vaList = vas ?? [];

  // Single batch query for all VAs — avoids N+1
  const vaIds = vaList.map(v => v.id);
  const { data: allLogs } = vaIds.length > 0
    ? await admin
        .from("daily_logs")
        .select("user_id, log_date, mood, tasks_done")
        .in("user_id", vaIds)
        .gte("log_date", since)
        .order("log_date", { ascending: false })
    : { data: [] };

  const summaryMap: Record<string, { user_id: string; log_date: string; mood: string | null; tasks_done: string | null }[]> = {};
  for (const log of allLogs ?? []) {
    const l = log as { user_id: string; log_date: string; mood: string | null; tasks_done: string | null };
    if (!summaryMap[l.user_id]) summaryMap[l.user_id] = [];
    summaryMap[l.user_id].push(l);
  }

  // Pending leave for the client (relocated here from My Job, which is an
  // employee page a client shouldn't have to visit).
  const nameById = new Map(vaList.map((v) => [v.id, v.full_name ?? v.email]));
  const { data: leaveRows } = await admin
    .from("va_leave_requests")
    .select("id, user_id, start_date, end_date, leave_type, reason, status")
    .eq("client_id", user.client_id)
    .eq("status", "pending")
    .order("start_date");
  const pendingLeave: PendingLeave[] = ((leaveRows ?? []) as { id: string; user_id: string; start_date: string; end_date: string; leave_type: string | null; reason: string | null }[])
    .map((r) => ({ id: r.id, userName: nameById.get(r.user_id) ?? "VA", start_date: r.start_date, end_date: r.end_date, leave_type: r.leave_type, reason: r.reason }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Team</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {vaList.length} VA{vaList.length !== 1 ? "s" : ""} · Daily log reports and activity
          </p>
        </div>
      </div>

      <TeamLeaveApprovals initial={pendingLeave} />

      {vaList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-16 text-center">
          <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-300 font-semibold text-lg mb-1">No VAs assigned yet</p>
          <p className="text-zinc-500 text-sm">VA accounts assigned to your client will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {vaList.map(va => {
            const logs = summaryMap[va.id] ?? [];
            const logsThisWeek = logs.length;
            const lastLog = logs[0];
            const initials = (va.full_name ?? va.email)
              .split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();

            return (
              <Link
                key={va.id}
                href={`/team/${va.id}`}
                className="group flex items-center gap-5 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5 hover:border-zinc-600 hover:bg-zinc-800/60 transition-all"
              >
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
                  </div>
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
                          {entry?.mood ? MOOD_EMOJI[entry.mood] ?? "•" : (
                            <span className="text-zinc-700 text-[10px]">–</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Log stats */}
                <div className="shrink-0 text-center w-20">
                  <div className="flex items-center justify-center gap-1.5">
                    <NotebookPen className="w-4 h-4 text-zinc-500" />
                    <p className="text-xl font-bold text-zinc-100">{logsThisWeek}</p>
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5">logs this week</p>
                  {lastLog && (
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Last: {format(new Date(lastLog.log_date), "dd MMM")}
                    </p>
                  )}
                </div>

                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
