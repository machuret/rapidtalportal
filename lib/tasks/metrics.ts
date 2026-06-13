/**
 * Shared task/time metrics — one definition of "hours worked" and "on time",
 * reused by the dashboard, Supervision, Reports, Team and Tasks. Previously the
 * hours reduce was hand-written in six files and the on-time rule in three, so
 * a single change meant editing all of them. Pure and unit-tested.
 */
export interface TimeRange { started_at: string; ended_at: string | null }

/** Total worked hours from time entries — sums (ended − started) for closed entries. */
export function sumWorkHours(entries: TimeRange[]): number {
  let ms = 0;
  for (const e of entries) if (e.ended_at) ms += new Date(e.ended_at).getTime() - new Date(e.started_at).getTime();
  return ms / 3_600_000;
}

/** Worked hours rounded to one decimal (the figure shown in the UI). */
export function workHours(entries: TimeRange[]): number {
  return Math.round(sumWorkHours(entries) * 10) / 10;
}

/** A task counts as on time if completed on or before end-of-day on its due date. */
export function isOnTime(completedAt: string, dueDate: string): boolean {
  return new Date(completedAt).getTime() <= new Date(dueDate + "T23:59:59").getTime();
}

/**
 * On-time percentage over completed tasks that had a due date. Returns null when
 * none had a due date (so the UI can show "—" instead of a misleading 0%/100%).
 */
export function onTimePct(tasks: { completed_at: string | null; due_date: string | null }[]): number | null {
  let num = 0, den = 0;
  for (const t of tasks) {
    if (t.completed_at && t.due_date) { den++; if (isOnTime(t.completed_at, t.due_date)) num++; }
  }
  return den ? Math.round((num / den) * 100) : null;
}
