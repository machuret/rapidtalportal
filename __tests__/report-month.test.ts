import { previousMonthKey } from "@/app/(portal)/reports/report-data";

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
