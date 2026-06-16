/**
 * Leave-usage math for the My Job → Leave tab.
 *
 * The leave system records requests (annual / sick / personal / unpaid) and an
 * approve/decline workflow, but never told anyone how much had actually been
 * taken. This computes business-days-taken from approved requests so the VA and
 * client can see usage at a glance.
 *
 * Leave is counted in working days (Mon–Fri), inclusive of both endpoints —
 * the same way most contracts express an allowance. Public-holiday exclusion is
 * supported via `opts.exclude` but off by default, because the applicable
 * holiday region lives on the placement, not the leave row.
 *
 * Pure + dependency-free for clean unit testing.
 */

export type LeaveType = "annual" | "sick" | "personal" | "unpaid";
const LEAVE_TYPES: readonly LeaveType[] = ["annual", "sick", "personal", "unpaid"];

export interface LeaveRequestLike {
  start_date: string; // yyyy-mm-dd
  end_date: string;   // yyyy-mm-dd
  leave_type: string;
  status: string;
}

export interface LeaveSummary {
  annual: number;
  sick: number;
  personal: number;
  unpaid: number;
  total: number;
}

/**
 * Inclusive count of weekdays (Mon–Fri) from `start` to `end` (ISO yyyy-mm-dd).
 * Returns 0 for an invalid or reversed range. Optionally excludes a set of ISO
 * holiday dates.
 */
export function businessDaysInclusive(
  start: string,
  end: string,
  opts?: { exclude?: Set<string> },
): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;

  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getUTCDay(); // 0 = Sun … 6 = Sat
    const iso = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !opts?.exclude?.has(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * Business days of APPROVED leave whose `start_date` falls in `year`, grouped by
 * type. Non-approved requests and other years are ignored; an unrecognised
 * `leave_type` is bucketed as `annual`.
 */
export function summariseLeaveTaken(rows: LeaveRequestLike[], year: number): LeaveSummary {
  const sum: LeaveSummary = { annual: 0, sick: 0, personal: 0, unpaid: 0, total: 0 };
  for (const r of rows) {
    if (r.status !== "approved") continue;
    const startYear = new Date(`${r.start_date}T00:00:00Z`).getUTCFullYear();
    if (startYear !== year) continue;

    const days = businessDaysInclusive(r.start_date, r.end_date);
    if (days === 0) continue;

    const key: LeaveType = LEAVE_TYPES.includes(r.leave_type as LeaveType)
      ? (r.leave_type as LeaveType)
      : "annual";
    sum[key] += days;
    sum.total += days;
  }
  return sum;
}
