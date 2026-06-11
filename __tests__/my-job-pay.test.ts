import { periodEarnings, fmtMoney, type PayContract, type WorkedDay } from "@/lib/my-job/pay";

const c = (pay_period: string, rate: number | null = 10): PayContract => ({ rate, currency: "USD", pay_period });
const days = (...dates: string[]): WorkedDay[] => dates.map((d) => ({ work_date: d, hours: 8 }));

describe("periodEarnings", () => {
  it("returns null amount when no rate is set", () => {
    const r = periodEarnings({ rate: null, currency: "USD", pay_period: "daily" }, days("2026-06-01"));
    expect(r.amount).toBeNull();
    expect(r.basis).toBe("Rate not set");
  });

  it("returns null amount when no days are logged", () => {
    const r = periodEarnings(c("daily"), []);
    expect(r.amount).toBeNull();
    expect(r.days).toBe(0);
  });

  it("computes hourly pay from summed hours", () => {
    const r = periodEarnings(c("hourly"), [
      { work_date: "2026-06-01", hours: 8 },
      { work_date: "2026-06-02", hours: 5 },
    ]);
    expect(r.amount).toBe(130); // 13 hrs * 10
    expect(r.hours).toBe(13);
  });

  it("computes daily pay from the day count", () => {
    const r = periodEarnings(c("daily"), days("2026-06-01", "2026-06-02", "2026-06-03"));
    expect(r.amount).toBe(30);
    expect(r.days).toBe(3);
  });

  it("computes weekly pay from distinct ISO weeks", () => {
    // 2026-06-01 (Mon) and 2026-06-03 (Wed) are the same ISO week;
    // 2026-06-08 (Mon) is the next week → 2 weeks.
    const r = periodEarnings(c("weekly"), days("2026-06-01", "2026-06-03", "2026-06-08"));
    expect(r.amount).toBe(20); // 2 weeks * 10
    expect(r.basis).toContain("2 weeks");
  });

  it("computes fortnightly pay as ceil(weeks / 2)", () => {
    // Three distinct weeks → 2 fortnights.
    const r = periodEarnings(c("fortnightly"), days("2026-06-01", "2026-06-08", "2026-06-15"));
    expect(r.amount).toBe(20); // ceil(3/2)=2 * 10
    expect(r.basis).toContain("2 fortnights");
  });

  it("computes monthly pay from the months-in-period argument", () => {
    expect(periodEarnings(c("monthly"), days("2026-06-01"), 1).amount).toBe(10);
    expect(periodEarnings(c("monthly"), days("2026-06-01"), 3).amount).toBe(30);
  });

  it("singularises the monthly basis label", () => {
    expect(periodEarnings(c("monthly"), days("2026-06-01"), 1).basis).toContain("1 month ×");
    expect(periodEarnings(c("monthly"), days("2026-06-01"), 2).basis).toContain("2 months ×");
  });

  it("counts an ISO week that spans a year boundary as one week", () => {
    // 2026-12-31 (Thu) and 2027-01-01 (Fri) fall in the same ISO week.
    const r = periodEarnings(c("weekly"), days("2026-12-31", "2027-01-01"));
    expect(r.amount).toBe(10); // 1 week
  });
});

describe("fmtMoney", () => {
  it("formats a valid ISO currency", () => {
    expect(fmtMoney(1234.5, "USD")).toMatch(/1,234\.50/);
  });

  it("falls back gracefully on an invalid currency code", () => {
    expect(fmtMoney(10, "A$")).toBe("A$ 10.00");
  });
});
