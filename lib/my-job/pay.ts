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

/**
 * Earnings for a set of logged days under a contract. Months count once if any
 * day was logged; weeks/fortnights count by distinct ISO weeks containing work.
 */
export function periodEarnings(contract: PayContract | null, days: WorkedDay[], monthsInPeriod = 1): PeriodEarnings {
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
    default:
      return { amount: monthsInPeriod * rate, basis: `${monthsInPeriod} month${monthsInPeriod !== 1 ? "s" : ""} × ${fmtMoney(rate, ccy)}/month`, days: dayCount, hours: hourSum };
  }
}
