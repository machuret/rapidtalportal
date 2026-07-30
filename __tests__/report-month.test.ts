import { previousMonthKey, recentMonths } from "@/app/(portal)/reports/report-data";

describe("previousMonthKey", () => {
  it("steps back within a year", () => {
    expect(previousMonthKey("2026-06")).toBe("2026-05");
  });
  it("wraps across the year boundary", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });
  it("zero-pads single-digit months", () => {
    expect(previousMonthKey("2026-10")).toBe("2026-09");
    expect(previousMonthKey("2026-03")).toBe("2026-02");
  });
});

describe("recentMonths", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not duplicate a month when today is near the end of a long month", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
    const months = recentMonths(6);
    expect(months.map((month) => month.key)).toEqual([
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
      "2026-03",
      "2026-02",
    ]);
    expect(new Set(months.map((month) => month.key)).size).toBe(months.length);
  });
});
