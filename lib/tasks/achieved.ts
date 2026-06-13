/**
 * "Tasks Achieved" stats — pure, server-computed from the board's tasks so the
 * VA sees what they've completed at a glance (this week / month / total, on-time
 * rate, and the most recent few). Kept dependency-free and unit-tested because
 * it underpins the headline view and the My Job self-report synergy.
 */
import { isOnTime } from "./metrics";

export interface AchievedTask {
  title: string;
  status: string;
  completed_at: string | null;
  due_date: string | null;
}

export interface AchievedSummary {
  week: number;
  month: number;
  total: number;
  /** % of completed-with-due-date tasks finished on or before the due date; null if none. */
  onTimePct: number | null;
  recent: { title: string; completed_at: string }[];
}

/** Local midnight of the most recent Monday. */
function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return d;
}

export function computeAchieved(tasks: AchievedTask[], now: Date = new Date()): AchievedSummary {
  const weekStart = startOfWeek(now).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const done = tasks.filter((t) => t.status === "done");
  const withTs = done.filter((t) => t.completed_at);

  let week = 0;
  let month = 0;
  let onTimeDenom = 0;
  let onTime = 0;

  for (const t of withTs) {
    const ts = new Date(t.completed_at!).getTime();
    if (ts >= weekStart) week++;
    if (ts >= monthStart) month++;
    if (t.due_date) {
      onTimeDenom++;
      if (isOnTime(t.completed_at!, t.due_date)) onTime++;
    }
  }

  const recent = [...withTs]
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
    .slice(0, 5)
    .map((t) => ({ title: t.title, completed_at: t.completed_at! }));

  return {
    week,
    month,
    total: done.length,
    onTimePct: onTimeDenom ? Math.round((onTime / onTimeDenom) * 100) : null,
    recent,
  };
}
