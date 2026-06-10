import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  KanbanSquare, NotebookPen, CheckCircle2, AlertTriangle, Eye, Clock, Users, ArrowRight,
} from "lucide-react";

/**
 * Role-aware "first screen" strips for the dashboard. Server components —
 * the page computes the numbers and these just render judgment:
 * a VA sees their day, a client admin sees their team's day.
 */

export function VaDayStrip({
  openTasks, dueToday, overdue, loggedToday,
}: {
  openTasks: number; dueToday: number; overdue: number; loggedToday: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Link href="/tasks" className="surface-card rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors group">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <KanbanSquare className="w-3.5 h-3.5" /> My tasks
          <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-lg font-bold text-zinc-100">
          {openTasks} open
          {dueToday > 0 && <span className="text-sm font-medium text-blue-400"> · {dueToday} due today</span>}
        </p>
        {overdue > 0 && (
          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 mt-1">
            <AlertTriangle className="w-3 h-3" /> {overdue} overdue
          </p>
        )}
      </Link>

      <Link href="/daily-log" className={cn(
        "surface-card rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors group",
        !loggedToday && "border-amber-500/40",
      )}>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <NotebookPen className="w-3.5 h-3.5" /> Daily log
          <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {loggedToday ? (
          <p className="inline-flex items-center gap-1.5 text-lg font-bold text-green-400">
            <CheckCircle2 className="w-4 h-4" /> Done today
          </p>
        ) : (
          <>
            <p className="text-lg font-bold text-amber-300">Not yet</p>
            <p className="text-[11px] text-zinc-500 mt-1">Your client reads these — log before you wrap up.</p>
          </>
        )}
      </Link>

      <Link href="/ask" className="surface-card rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors group">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <Eye className="w-3.5 h-3.5" /> Stuck on something?
          <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-lg font-bold text-zinc-100">Ask the Vault</p>
        <p className="text-[11px] text-zinc-500 mt-1">Answers from the company brain, with sources.</p>
      </Link>
    </div>
  );
}

export function AdminTeamStrip({
  vaCount, loggedToday, openTasks, reviewTasks, hoursToday,
}: {
  vaCount: number; loggedToday: number; openTasks: number; reviewTasks: number; hoursToday: number;
}) {
  const allLogged = vaCount > 0 && loggedToday >= vaCount;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Link href="/daily-log" className={cn(
        "surface-card rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors group",
        vaCount > 0 && loggedToday === 0 && "border-amber-500/40",
      )}>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <Users className="w-3.5 h-3.5" /> Team today
          <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className={cn("text-lg font-bold", allLogged ? "text-green-400" : "text-zinc-100")}>
          {loggedToday}/{vaCount} logged
        </p>
        <p className="text-[11px] text-zinc-500 mt-1 inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> {hoursToday.toFixed(1)}h tracked today
        </p>
      </Link>

      <Link href="/tasks" className={cn(
        "surface-card rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors group",
        reviewTasks > 0 && "border-blue-500/40",
      )}>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <KanbanSquare className="w-3.5 h-3.5" /> Task board
          <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-lg font-bold text-zinc-100">{openTasks} open</p>
        {reviewTasks > 0 ? (
          <p className="text-[11px] font-medium text-blue-400 mt-1">{reviewTasks} waiting for your review</p>
        ) : (
          <p className="text-[11px] text-zinc-500 mt-1">Nothing waiting on you.</p>
        )}
      </Link>

      <Link href="/supervision" className="surface-card rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors group">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <Eye className="w-3.5 h-3.5" /> Supervision
          <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-lg font-bold text-zinc-100">Full picture</p>
        <p className="text-[11px] text-zinc-500 mt-1">Logs, hours, SOPs and flags per VA.</p>
      </Link>
    </div>
  );
}
