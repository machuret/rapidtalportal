"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, ClipboardCheck, MessageSquare, NotebookPen, Wand2, ArrowRight, Activity } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { TimeTracker } from "@/components/dashboard/TimeTracker";

interface Kpis {
  dueToday: number; highPriority: number;
  hours: number; weeklyGoal: number | null;
  pendingReview: number; reviewOverdue: number;
  unread: number;
}
interface ActiveTask {
  id: string; title: string; status: string; due_date: string | null; priority: number; category: string | null;
}
interface ActivityItem {
  id: string; kind: string; body: string; actor: string; taskTitle: string | null; createdAt: string;
}

interface VaDashboardProps {
  firstName: string;
  dateLabel: string;
  todayIso: string;
  clientName: string;
  userId: string;
  kpis: Kpis;
  activeTasks: ActiveTask[];
  activity: ActivityItem[];
  loggedToday: boolean;
}

// Card chrome — one definition, reused. rounded-xl + shadow-sm are token-backed
// (see tailwind.config.ts), so this themes with the rest of the app.
const CARD = "bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm";

const PRIORITY: Record<number, { label: string; cls: string }> = {
  4: { label: "Urgent", cls: "text-red-400 bg-red-500/10" },
  3: { label: "High",   cls: "text-amber-400 bg-amber-500/10" },
  2: { label: "Normal", cls: "text-zinc-400 bg-zinc-800" },
  1: { label: "Low",    cls: "text-zinc-500 bg-zinc-800" },
};
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export function VaDashboard({ firstName, dateLabel, todayIso, clientName, userId, kpis, activeTasks, activity, loggedToday }: VaDashboardProps) {
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const goalPct = kpis.weeklyGoal ? Math.round((kpis.hours / kpis.weeklyGoal) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 mb-2">{dateLabel}</p>
          <h1 className="font-display text-[42px] leading-[0.95] tracking-[0.02em] text-zinc-50 mb-2" suppressHydrationWarning>{greeting}, {firstName}</h1>
          <p className="text-sm text-zinc-400">
            You have <strong className="text-zinc-50 font-semibold">{kpis.dueToday} task{kpis.dueToday !== 1 ? "s" : ""}</strong> due today and{" "}
            <strong className="text-zinc-50 font-semibold">{kpis.pendingReview} item{kpis.pendingReview !== 1 ? "s" : ""}</strong> awaiting client review.
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link href="/daily-log" className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-50 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 hover:border-zinc-600 transition-colors">
            <NotebookPen className="w-4 h-4" /> {loggedToday ? "Daily Log ✓" : "Daily Log"}
          </Link>
          <Link href="/compose" className="inline-flex items-center gap-2 text-xs font-bold text-white bg-orange-500 border border-orange-500 rounded-lg px-[18px] py-2.5 shadow-[0_6px_18px_rgb(var(--orange-500)/0.28)] hover:bg-orange-400 transition-colors">
            <Wand2 className="w-4 h-4" /> Compose
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Tasks Due Today" value={kpis.dueToday} unit="tasks" icon={CheckCircle2} tile="text-amber-400 bg-amber-500/10"
          delta={kpis.highPriority > 0 ? `${kpis.highPriority} high priority` : "all clear"} deltaCls={kpis.highPriority > 0 ? "text-amber-400" : "text-zinc-500"} />
        <Kpi label="Hours Logged" value={kpis.hours} unit="h" icon={Clock} tile="text-blue-400 bg-blue-500/10"
          delta={goalPct !== null ? `${goalPct}% to weekly goal` : "this week"} deltaCls="text-green-400" />
        <Kpi label="Pending Review" value={kpis.pendingReview} unit="items" icon={ClipboardCheck} tile="text-orange-500 bg-orange-500/10"
          delta={kpis.reviewOverdue > 0 ? `${kpis.reviewOverdue} overdue with client` : "with client"} deltaCls={kpis.reviewOverdue > 0 ? "text-red-400" : "text-zinc-500"} />
        <Kpi label="Unread Messages" value={kpis.unread} unit="new" icon={MessageSquare} tile="text-purple-400 bg-purple-500/10"
          delta={clientName ? `From ${clientName}` : "—"} deltaCls="text-zinc-500" />
      </div>

      {/* Active Tasks + Recent Activity */}
      <div className="grid lg:grid-cols-[1.65fr_1fr] gap-5 items-start">
        {/* Active Tasks */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="flex items-center gap-2.5 px-5 py-4">
            <h2 className="text-base font-bold text-zinc-50">Active Tasks</h2>
            <span className="font-mono text-[11px] text-zinc-500 bg-zinc-800 rounded-md px-1.5 py-0.5">{activeTasks.length}</span>
          </div>
          {activeTasks.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-zinc-500 border-t border-zinc-800 pt-5">Nothing in progress right now. Pick up a task from the board.</p>
          ) : (
            activeTasks.map((t) => {
              const pri = PRIORITY[t.priority] ?? PRIORITY[2];
              const overdue = t.due_date && t.due_date < todayIso;
              const isToday = t.due_date === todayIso;
              const inProgress = t.status === "in_progress";
              return (
                <Link key={t.id} href="/tasks" className="flex items-center gap-3.5 px-5 py-3 border-t border-zinc-800 hover:bg-zinc-800/60 transition-colors">
                  {/* Status indicator (not a checkbox — the row opens the board) */}
                  <span title={inProgress ? "In progress" : "To do"} className={`w-2.5 h-2.5 shrink-0 rounded-full ${inProgress ? "bg-orange-500" : "border-[1.6px] border-zinc-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-50 truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      <span>{t.category ?? "Uncategorised"}</span>
                      <span className="w-[3px] h-[3px] rounded-full bg-zinc-600" />
                      <span className="font-semibold text-zinc-400">{inProgress ? "In progress" : "To do"}</span>
                    </div>
                  </div>
                  {t.due_date && (
                    <span className={`text-xs font-semibold whitespace-nowrap ${overdue ? "text-red-400" : isToday ? "text-amber-400" : "text-zinc-500"}`}>
                      {overdue ? "Overdue" : isToday ? "Today" : formatDate(t.due_date, { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold uppercase tracking-[0.03em] rounded-full px-2.5 py-0.5 whitespace-nowrap ${pri.cls}`}>{pri.label}</span>
                </Link>
              );
            })
          )}
          <Link href="/tasks" className="flex border-t border-zinc-800 px-5 py-3 text-xs font-bold text-orange-500 items-center gap-1.5">
            View all tasks <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </section>

        {/* Recent Activity */}
        <section className={`${CARD} p-5`}>
          <h2 className="text-base font-bold text-zinc-50 mb-4">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">No recent activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-zinc-800 flex items-center justify-center text-[11px] font-bold text-zinc-300">{initials(a.actor)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-300 leading-snug">
                      <strong className="text-zinc-50 font-semibold">{a.actor}</strong>{" "}
                      {a.kind === "comment" ? "commented" : a.body}
                      {a.taskTitle && <span className="text-zinc-500"> · {a.taskTitle}</span>}
                    </p>
                    {a.kind === "comment" && <p className="text-xs text-zinc-500 truncate mt-0.5">“{a.body}”</p>}
                    <p className="text-[11px] text-zinc-600 mt-0.5"><RelativeTime value={a.createdAt} /></p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Time tracker — log your work for the Hours KPI */}
      <section className={`${CARD} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-zinc-400" />
          <h2 className="text-base font-bold text-zinc-50">Time tracker</h2>
        </div>
        <TimeTracker userId={userId} />
      </section>
    </div>
  );
}

function Kpi({ label, value, unit, icon: Icon, tile, delta, deltaCls }: {
  label: string; value: number; unit: string; icon: typeof Clock; tile: string; delta: string; deltaCls: string;
}) {
  return (
    <div className={`${CARD} p-[18px]`}>
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-xs font-semibold text-zinc-400">{label}</span>
        <span className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-md ${tile}`}><Icon className="w-4 h-4" /></span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-4xl leading-none tracking-[0.01em] text-zinc-50">{value}</span>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
      <p className={`mt-2.5 text-xs font-semibold ${deltaCls}`}>{delta}</p>
    </div>
  );
}
