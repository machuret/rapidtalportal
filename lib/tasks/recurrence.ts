/**
 * Pure date math for recurring tasks — kept dependency-free and unit-tested
 * because the cron's correctness (no missed runs, no bursts) rides on it.
 * Dates are ISO `YYYY-MM-DD` strings handled in UTC to avoid timezone drift.
 */
export type Frequency = "daily" | "weekly" | "monthly";

export const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly"];

const toUTC = (ymd: string): Date => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const fmt = (d: Date): string => d.toISOString().slice(0, 10);

/** The next occurrence strictly after `ymd`, one cadence step forward. */
export function advanceDate(ymd: string, frequency: Frequency, interval: number): string {
  const d = toUTC(ymd);
  const step = Math.max(1, Math.trunc(interval));
  if (frequency === "daily") {
    d.setUTCDate(d.getUTCDate() + step);
  } else if (frequency === "weekly") {
    d.setUTCDate(d.getUTCDate() + step * 7);
  } else {
    // monthly: keep the anchor day-of-month, clamping for short months.
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + step);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return fmt(d);
}

/**
 * Collapse any missed periods: starting from `from`, advance until the date is
 * strictly after `today`. Returns the next future run date. Guarantees one card
 * per due window — a recurrence that lapsed for a week doesn't spawn a burst.
 */
export function nextRunAfter(from: string, frequency: Frequency, interval: number, today: string): string {
  let next = from;
  // Bounded: monthly over years still terminates quickly; cap defensively.
  for (let i = 0; i < 1000 && next <= today; i++) {
    next = advanceDate(next, frequency, interval);
  }
  return next;
}

/** Human label for a cadence, e.g. "Every day", "Every 2 weeks", "Monthly". */
export function cadenceLabel(frequency: Frequency, interval: number): string {
  const n = Math.max(1, Math.trunc(interval));
  const unit = frequency === "daily" ? "day" : frequency === "weekly" ? "week" : "month";
  if (n === 1) return frequency === "daily" ? "Every day" : frequency === "weekly" ? "Weekly" : "Monthly";
  return `Every ${n} ${unit}s`;
}
