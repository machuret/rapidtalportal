import {
  businessDaysInclusive,
  summariseLeaveTaken,
  effectiveAnnualAllowance,
  annualRemaining,
  DEFAULT_ANNUAL_LEAVE_DAYS,
} from "@/lib/my-job/leave";

describe("effectiveAnnualAllowance", () => {
  it("uses the contract value when set (including 0)", () => {
    expect(effectiveAnnualAllowance(25)).toBe(25);
    expect(effectiveAnnualAllowance(0)).toBe(0);
  });
  it("falls back to the default when null/undefined", () => {
    expect(effectiveAnnualAllowance(null)).toBe(DEFAULT_ANNUAL_LEAVE_DAYS);
    expect(effectiveAnnualAllowance(undefined)).toBe(DEFAULT_ANNUAL_LEAVE_DAYS);
  });
});

describe("annualRemaining", () => {
  it("subtracts taken from allowance", () => {
    expect(annualRemaining(20, 8)).toBe(12);
  });
  it("never goes negative", () => {
    expect(annualRemaining(20, 25)).toBe(0);
  });
});

describe("businessDaysInclusive", () => {
  it("counts a single weekday as 1", () => {
    expect(businessDaysInclusive("2026-06-15", "2026-06-15")).toBe(1); // Mon
  });
  it("excludes weekends across a full week", () => {
    // Mon 2026-06-15 → Sun 2026-06-21 = 5 weekdays
    expect(businessDaysInclusive("2026-06-15", "2026-06-21")).toBe(5);
  });
  it("returns 0 for a weekend-only range", () => {
    // Sat–Sun
    expect(businessDaysInclusive("2026-06-20", "2026-06-21")).toBe(0);
  });
  it("returns 0 for a reversed or invalid range", () => {
    expect(businessDaysInclusive("2026-06-21", "2026-06-15")).toBe(0);
    expect(businessDaysInclusive("nope", "2026-06-15")).toBe(0);
  });
  it("honours a holiday exclusion set", () => {
    const exclude = new Set(["2026-06-16"]); // a Tue in the range
    expect(businessDaysInclusive("2026-06-15", "2026-06-19", { exclude })).toBe(4);
  });
});

describe("summariseLeaveTaken", () => {
  const rows = [
    { start_date: "2026-06-15", end_date: "2026-06-19", leave_type: "annual", status: "approved" },   // 5
    { start_date: "2026-03-02", end_date: "2026-03-03", leave_type: "sick", status: "approved" },      // 2
    { start_date: "2026-07-01", end_date: "2026-07-01", leave_type: "annual", status: "pending" },     // ignored (pending)
    { start_date: "2025-12-29", end_date: "2025-12-31", leave_type: "annual", status: "approved" },    // ignored (other year)
    { start_date: "2026-08-10", end_date: "2026-08-10", leave_type: "weird", status: "approved" },     // 1 → annual bucket
  ];

  it("sums approved business days for the year, grouped by type", () => {
    const s = summariseLeaveTaken(rows, 2026);
    expect(s.annual).toBe(6); // 5 + 1 (unknown type bucketed annual)
    expect(s.sick).toBe(2);
    expect(s.personal).toBe(0);
    expect(s.unpaid).toBe(0);
    expect(s.total).toBe(8);
  });

  it("scopes to the requested year (Dec 29–31 2025 = 3 weekdays)", () => {
    expect(summariseLeaveTaken(rows, 2025)).toEqual({ annual: 3, sick: 0, personal: 0, unpaid: 0, total: 3 });
  });

  it("splits a year-spanning request across both calendar years", () => {
    const spanning = [{ start_date: "2025-12-29", end_date: "2026-01-02", leave_type: "annual", status: "approved" }];
    expect(summariseLeaveTaken(spanning, 2025).annual).toBe(3); // Dec 29 Mon, 30 Tue, 31 Wed
    expect(summariseLeaveTaken(spanning, 2026).annual).toBe(2); // Jan 1 Thu, 2 Fri
  });
});
