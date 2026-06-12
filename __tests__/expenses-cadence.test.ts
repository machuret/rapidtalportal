import { monthlyEquivalent, yearlyEquivalent, summarizeByCurrency } from "@/lib/expenses/cadence";

describe("monthlyEquivalent / yearlyEquivalent", () => {
  it("normalises each cadence to a monthly figure", () => {
    expect(monthlyEquivalent(12, "monthly")).toBe(12);
    expect(monthlyEquivalent(120, "yearly")).toBe(10);
    expect(monthlyEquivalent(30, "quarterly")).toBe(10);
    expect(monthlyEquivalent(10, "weekly")).toBeCloseTo(43.333, 2);
  });
  it("treats one-off as zero run-rate", () => {
    expect(monthlyEquivalent(500, "one_off")).toBe(0);
    expect(yearlyEquivalent(500, "one_off")).toBe(0);
  });
  it("yearly equivalent matches the billing frequency", () => {
    expect(yearlyEquivalent(12, "monthly")).toBe(144);
    expect(yearlyEquivalent(100, "yearly")).toBe(100);
  });
});

describe("summarizeByCurrency", () => {
  const rows = [
    { amount: 20, currency: "USD", cadence: "monthly", status: "active" },   // 20/mo
    { amount: 120, currency: "USD", cadence: "yearly", status: "active" },   // 10/mo
    { amount: 50, currency: "AUD", cadence: "monthly", status: "active" },   // 50/mo
    { amount: 999, currency: "USD", cadence: "one_off", status: "active" },  // excluded
    { amount: 99, currency: "USD", cadence: "monthly", status: "cancelled" },// excluded
  ];

  it("sums recurring active spend per currency, excluding one-off & cancelled", () => {
    const out = summarizeByCurrency(rows);
    const usd = out.find((c) => c.currency === "USD")!;
    const aud = out.find((c) => c.currency === "AUD")!;
    expect(usd.monthly).toBe(30);
    expect(usd.yearly).toBe(360);
    expect(usd.count).toBe(2);
    expect(aud.monthly).toBe(50);
  });

  it("orders currencies by yearly spend, biggest first", () => {
    // AUD = 50/mo = 600/yr beats USD = 360/yr.
    expect(summarizeByCurrency(rows).map((c) => c.currency)).toEqual(["AUD", "USD"]);
  });

  it("returns nothing when there is no recurring active spend", () => {
    expect(summarizeByCurrency([{ amount: 10, currency: "USD", cadence: "one_off", status: "active" }])).toEqual([]);
  });
});
