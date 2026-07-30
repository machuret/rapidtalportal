import { todayInTimezone } from "@/lib/date-tz";

describe("todayInTimezone", () => {
  // 2026-06-16T23:30:00Z — late evening UTC.
  const lateUtc = new Date("2026-06-16T23:30:00Z");

  it("rolls forward east of UTC (Manila, UTC+8 → next day)", () => {
    expect(todayInTimezone("Asia/Manila", lateUtc)).toBe("2026-06-17");
  });

  it("stays on the UTC date for UTC", () => {
    expect(todayInTimezone("UTC", lateUtc)).toBe("2026-06-16");
  });

  it("rolls back west of UTC (Los Angeles, early-UTC morning → previous day)", () => {
    // 2026-06-16T03:00:00Z = 2026-06-15 evening in LA.
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-06-16T03:00:00Z"))).toBe("2026-06-15");
  });

  it("falls back to the Australian product timezone for a null or invalid zone", () => {
    expect(todayInTimezone(null, lateUtc)).toBe("2026-06-17");
    expect(todayInTimezone("Not/AZone", lateUtc)).toBe("2026-06-17");
  });
});
