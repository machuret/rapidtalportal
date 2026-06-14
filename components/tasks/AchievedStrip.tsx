"use client";

/**
 * "Tasks Achieved" — a compact, collapsible summary above the board showing what
 * the viewer has completed (this week / month / total + on-time rate), with a
 * peek at the most recent. For a VA it's their own wins; for an admin it's the
 * team's. Computed server-side (lib/tasks/achieved.ts) and passed in.
 */
import { useState } from "react";
import { Trophy, ChevronDown, CheckCircle2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { AchievedSummary } from "@/lib/tasks/achieved";

const when = (iso: string) =>
  formatDate(iso, { day: "numeric", month: "short" });

export function AchievedStrip({ summary, scope }: { summary: AchievedSummary; scope: "mine" | "team" }) {
  const [open, setOpen] = useState(false);
  if (summary.total === 0) return null; // nothing achieved yet — don't take up space

  const stats: { label: string; value: string }[] = [
    { label: "This week", value: String(summary.week) },
    { label: "This month", value: String(summary.month) },
    { label: "All time", value: String(summary.total) },
    ...(summary.onTimePct != null ? [{ label: "On time", value: `${summary.onTimePct}%` }] : []),
  ];

  return (
    <div className="surface-card mb-5 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-4 px-4 py-3 text-left">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
          <Trophy className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{scope === "mine" ? "Your achievements" : "Team achievements"}</p>
          <p className="text-xs text-zinc-500">{summary.week} completed this week · {summary.total} all time</p>
        </div>
        <div className="hidden sm:flex items-center gap-5 mr-2">
          {stats.map((s) => (
            <div key={s.label} className="text-right">
              <p className="text-lg font-bold text-white leading-none tabular-nums">{s.value}</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-3">
          {/* Stats repeat here on mobile, where the header row hides them. */}
          <div className="grid grid-cols-3 sm:hidden gap-3 mb-3">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-lg font-bold text-white leading-none tabular-nums">{s.value}</p>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="label-section mb-2">Recently completed</p>
          <ul className="flex flex-col gap-1.5">
            {summary.recent.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <span className="truncate flex-1">{r.title}</span>
                <span className="text-xs text-zinc-500 shrink-0">{when(r.completed_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
