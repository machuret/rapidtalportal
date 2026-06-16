/**
 * Shared pay math for the My Job document generators. One place for the
 * rate × days/hours logic so the invoice and the tax summary always agree.
 */

export interface PayContract {
  rate: number | null;
  currency: string;
  pay_period: string; // hourly | daily | weekly | fortnightly | monthly
}

export interface WorkedDay { work_date: string; hours: number | null }

export interface PeriodEarnings {
  amount: number | null;     // null when it can't be computed (no rate / no basis)
  basis: string;             // human description, e.g. "22 days × $10.00/day"
  days: number;
  hours: number;
}

export function fmtMoney(n: number, ccy: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${ccy} ${n.toFixed(2)}`;
  }
}

/** ISO week key (yyyy-Www) — used to count weeks for weekly/fortnightly rates. */
function isoWeek(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

/** Number of weekdays (Mon–Fri) in a given month. `month` is 1–12. */
export function weekdaysInMonth(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

/** Weekdays in the calendar month the logged days fall in (single-month callers). */
function weekdaysInMonthOf(days: WorkedDay[]): number {
  if (!days.length) return 0;
  const [y, m] = days[0].work_date.split("-").map(Number);
  return weekdaysInMonth(y, m);
}

/**
 * Earnings for a set of logged days under a contract.
 *
 * - hourly/daily/weekly/fortnightly scale with the work actually logged.
 * - **monthly is prorated** by weekdays worked ÷ weekdays in the month (capped at
 *   the full monthly rate) so a partial month doesn't bill a whole month — this
 *   feeds invoices and the BIR tax summary, which must reflect days actually
 *   worked. `expectedWorkingDays` lets the caller pass the month's weekday count
 *   explicitly; otherwise it's derived from the logged days' month.
 */
export function periodEarnings(
  contract: PayContract | null,
  days: WorkedDay[],
  monthsInPeriod = 1,
  expectedWorkingDays?: number,
): PeriodEarnings {
  const dayCount = days.length;
  const hourSum = days.reduce((s, d) => s + (d.hours ?? 0), 0);
  const rate = contract?.rate ?? null;
  const ccy = contract?.currency ?? "USD";

  if (rate == null || dayCount === 0) {
    return { amount: null, basis: dayCount === 0 ? "No days logged" : "Rate not set", days: dayCount, hours: hourSum };
  }

  switch (contract!.pay_period) {
    case "hourly":
      return { amount: hourSum * rate, basis: `${hourSum} hrs × ${fmtMoney(rate, ccy)}/hr`, days: dayCount, hours: hourSum };
    case "daily":
      return { amount: dayCount * rate, basis: `${dayCount} days × ${fmtMoney(rate, ccy)}/day`, days: dayCount, hours: hourSum };
    case "weekly": {
      const weeks = new Set(days.map((d) => isoWeek(d.work_date))).size;
      return { amount: weeks * rate, basis: `${weeks} weeks × ${fmtMoney(rate, ccy)}/week`, days: dayCount, hours: hourSum };
    }
    case "fortnightly": {
      const weeks = new Set(days.map((d) => isoWeek(d.work_date))).size;
      const fortnights = Math.ceil(weeks / 2);
      return { amount: fortnights * rate, basis: `${fortnights} fortnights × ${fmtMoney(rate, ccy)}/fortnight`, days: dayCount, hours: hourSum };
    }
    case "monthly":
    default: {
      const expected = expectedWorkingDays ?? weekdaysInMonthOf(days);
      // Without a working-days basis we can't prorate; bill the flat month(s).
      if (expected <= 0) {
        return { amount: monthsInPeriod * rate, basis: `${monthsInPeriod} month${monthsInPeriod !== 1 ? "s" : ""} × ${fmtMoney(rate, ccy)}/month`, days: dayCount, hours: hourSum };
      }
      const fraction = Math.min(dayCount / expected, 1);
      const amount = monthsInPeriod * rate * fraction;
      const basis = fraction >= 1
        ? `${monthsInPeriod} month${monthsInPeriod !== 1 ? "s" : ""} × ${fmtMoney(rate, ccy)}/month`
        : `${dayCount} of ${expected} working days × ${fmtMoney(rate, ccy)}/month (prorated)`;
      return { amount, basis, days: dayCount, hours: hourSum };
    }
  }
}
