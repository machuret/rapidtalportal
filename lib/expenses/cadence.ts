/**
 * Expense cadence math — pure and tested because the summary totals (and the
 * "monthly run-rate" the admin reads at a glance) depend on it. Multi-currency:
 * we never convert between currencies in v1, so everything is summed PER
 * currency.
 */
export type Cadence = "one_off" | "weekly" | "monthly" | "quarterly" | "yearly";

export const CADENCES: { key: Cadence; label: string }[] = [
  { key: "one_off", label: "One-off" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
];

/** How many times a year this cadence is billed (one-off = 0 → not recurring). */
const PER_YEAR: Record<Cadence, number> = { one_off: 0, weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

/** Recurring cost expressed per month. One-off returns 0 (it's not a run-rate). */
export function monthlyEquivalent(amount: number, cadence: Cadence): number {
  return (amount * (PER_YEAR[cadence] ?? 0)) / 12;
}

/** Recurring cost expressed per year. One-off returns 0. */
export function yearlyEquivalent(amount: number, cadence: Cadence): number {
  return amount * (PER_YEAR[cadence] ?? 0);
}

export interface ExpenseLike { amount: number; currency: string; cadence: string; status: string }

export interface CurrencyTotal { currency: string; monthly: number; yearly: number; count: number }

/**
 * Per-currency recurring run-rate from active, recurring expenses (cancelled and
 * one-off are excluded). Sorted by yearly spend, biggest first.
 */
export function summarizeByCurrency(expenses: ExpenseLike[]): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const e of expenses) {
    if (e.status !== "active") continue;
    const cadence = e.cadence as Cadence;
    if (cadence === "one_off") continue;
    const cur = map.get(e.currency) ?? { currency: e.currency, monthly: 0, yearly: 0, count: 0 };
    cur.monthly += monthlyEquivalent(e.amount, cadence);
    cur.yearly += yearlyEquivalent(e.amount, cadence);
    cur.count += 1;
    map.set(e.currency, cur);
  }
  return Array.from(map.values())
    .map((c) => ({ ...c, monthly: Math.round(c.monthly * 100) / 100, yearly: Math.round(c.yearly * 100) / 100 }))
    .sort((a, b) => b.yearly - a.yearly);
}
