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

/**
 * A task is overdue when it's still being worked (`todo`/`in_progress`) and its
 * due date is strictly before `today` (a 'YYYY-MM-DD' local date). Tasks in
 * `review` (delivered, awaiting client approval) or `done` are never overdue —
 * the client owns those, not the VA.
 */
export function isOverdue(task: { status: string; due_date: string | null }, today: string): boolean {
  return (task.status === "todo" || task.status === "in_progress") && !!task.due_date && task.due_date < today;
}

/** Whole days a 'YYYY-MM-DD' date is in the past relative to `today`. DST-safe (compares UTC midnights). */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(dueDate + "T00:00:00Z")) / 86_400_000);
}

/** Whole days a 'YYYY-MM-DD' date is ahead of `today` (negative if past). DST-safe. */
export function daysUntil(dueDate: string, today: string): number {
  return Math.round((Date.parse(dueDate + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}

/**
 * Due soon = still being worked (`todo`/`in_progress`), not yet overdue, and due
 * within `withinDays` (default 2) of `today` inclusive — i.e. the proactive
 * window before {@link isOverdue} kicks in. Mutually exclusive with isOverdue.
 */
export function isDueSoon(task: { status: string; due_date: string | null }, today: string, withinDays = 2): boolean {
  if (task.status !== "todo" && task.status !== "in_progress") return false;
  if (!task.due_date) return false;
  const d = daysUntil(task.due_date, today);
  return d >= 0 && d <= withinDays;
}
