"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowLeft, TrendingUp, Target, AlertTriangle, CalendarDays } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { AnalyticsEntry, Mood } from "@/types/daily-log";
import { useState } from "react";

const CHART = {
  grid:    "var(--chart-grid)",
  tick:    "var(--chart-tick)",
  tooltip: "var(--chart-tooltip)",
  line:    "var(--chart-line)",
  bar:     "var(--chart-bar)",
} as const;

const MOOD_SCORE: Record<Mood, number> = {
  great: 5, good: 4, neutral: 3, difficult: 2, overwhelmed: 1,
};

const MOOD_COLORS: Record<Mood, string> = {
  great: "#4ade80", good: "#60a5fa", neutral: "#facc15", difficult: "#fb923c", overwhelmed: "#f87171",
};

const MOOD_LABELS: Record<number, string> = { 1: "Overwhelmed", 2: "Difficult", 3: "Neutral", 4: "Good", 5: "Great" };

type Range = 7 | 30 | 90;

function countLines(text: string): number {
  if (!text?.trim()) return 0;
  return text.trim().split("\n").filter(l => l.trim()).length;
}

function topWords(entries: AnalyticsEntry[]): { word: string; count: number }[] {
  const stopWords = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","is","was","it","i","my","me","we","our","with","that","this","not","but","had","have","has","be","so","if","its","by","as","are"]);
  const freq: Record<string, number> = {};
  for (const e of entries) {
    const words = (e.challenges ?? "").toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
    for (const w of words) {
      if (!stopWords.has(w)) freq[w] = (freq[w] ?? 0) + 1;
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({ word, count }));
}

export function DailyLogAnalytics({ entries, userName }: { entries: AnalyticsEntry[]; userName: string }) {
  const [range, setRange] = useState<Range>(30);

  const filtered = entries.slice(-range);

  const chartData = filtered.map(e => ({
    date:   format(parseISO(e.log_date), "MMM d"),
    mood:   e.mood ? MOOD_SCORE[e.mood] : null,
    moodLabel: e.mood ?? "none",
    tasks:  countLines(e.tasks_done),
    goalsHit: e.goals_achieved?.trim() ? 1 : 0,
  }));

  const daysLogged = filtered.length;
  const daysWithGoals = filtered.filter(e => e.goals_achieved?.trim()).length;
  const goalsRate = daysLogged > 0 ? Math.round((daysWithGoals / daysLogged) * 100) : 0;
  const avgMood = filtered.filter(e => e.mood).reduce((sum, e) => sum + MOOD_SCORE[e.mood!], 0) / (filtered.filter(e => e.mood).length || 1);
  const avgMoodLabel = MOOD_LABELS[Math.round(avgMood)] ?? "—";
  const totalTasks = filtered.reduce((sum, e) => sum + countLines(e.tasks_done), 0);
  const challengeWords = topWords(filtered);

  const CustomDot = (props: { cx?: number; cy?: number; payload?: { moodLabel: string } }) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || !payload?.moodLabel || payload.moodLabel === "none") return null;
    const color = MOOD_COLORS[payload.moodLabel as Mood] ?? "#71717a";
    return <circle cx={cx} cy={cy} r={4} fill={color} stroke="none" />;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/daily-log" aria-label="Back to Daily Log" className="text-zinc-500 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          </div>
          <p className="text-zinc-400 text-sm">{userName} — productivity trends</p>
        </div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {([7, 30, 90] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${range === r ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white"}`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: CalendarDays, label: "Days Logged",    value: daysLogged,     color: "text-blue-400"   },
          { icon: TrendingUp,   label: "Avg Mood",       value: avgMoodLabel,   color: "text-green-400"  },
          { icon: Target,       label: "Goals Hit Rate", value: `${goalsRate}%`, color: "text-purple-400" },
          { icon: AlertTriangle,label: "Tasks Completed",value: totalTasks,     color: "text-amber-400"  },
        ].map(s => (
          <div key={s.label} className="surface-card px-4 py-4">
            <s.icon className={`w-4 h-4 mb-2 ${s.color}`} />
            <p className={`stat-value ${s.color}`}>{s.value}</p>
            <p className="label-section mt-2">{s.label}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg mb-1">No data for this range</p>
          <p className="text-sm">Start logging daily to see trends here.</p>
        </div>
      ) : (
        <>
          {/* Mood trend */}
          <div className="surface-card px-5 py-4">
            <p className="text-sm font-semibold mb-4">Mood Trend</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis dataKey="date" tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} />
                <YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} tickFormatter={v => MOOD_LABELS[v]?.slice(0,3) ?? ""} tick={{ fill: CHART.tick, fontSize: 10 }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: CHART.tooltip, border: `1px solid ${CHART.grid}`, borderRadius: 8 }}
                  formatter={(v) => [MOOD_LABELS[Number(v)] ?? v, "Mood"]}
                  labelStyle={{ color: CHART.tick }}
                />
                <Line type="monotone" dataKey="mood" stroke={CHART.line} strokeWidth={2} dot={<CustomDot />} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tasks per day */}
          <div className="surface-card px-5 py-4">
            <p className="text-sm font-semibold mb-4">Tasks Completed Per Day</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis dataKey="date" tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: CHART.tooltip, border: `1px solid ${CHART.grid}`, borderRadius: 8 }}
                  labelStyle={{ color: CHART.tick }}
                />
                <Bar dataKey="tasks" fill={CHART.bar} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top challenge words */}
          {challengeWords.length > 0 && (
            <div className="surface-card px-5 py-4">
              <p className="text-sm font-semibold mb-3">Top Challenge Keywords</p>
              <div className="flex gap-2 flex-wrap">
                {challengeWords.map(w => (
                  <span
                    key={w.word}
                    className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-300"
                    style={{ fontSize: `${Math.min(14 + w.count * 1.5, 22)}px` }}
                  >
                    {w.word}
                    <span className="ml-1.5 text-xs text-zinc-500">{w.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
