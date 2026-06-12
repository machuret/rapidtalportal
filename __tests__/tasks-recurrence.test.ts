import { advanceDate, nextRunAfter, cadenceLabel } from "@/lib/tasks/recurrence";

describe("advanceDate", () => {
  it("adds days / weeks", () => {
    expect(advanceDate("2026-06-12", "daily", 1)).toBe("2026-06-13");
    expect(advanceDate("2026-06-12", "daily", 3)).toBe("2026-06-15");
    expect(advanceDate("2026-06-12", "weekly", 1)).toBe("2026-06-19");
    expect(advanceDate("2026-06-12", "weekly", 2)).toBe("2026-06-26");
  });

  it("adds months keeping the day-of-month", () => {
    expect(advanceDate("2026-06-15", "monthly", 1)).toBe("2026-07-15");
    expect(advanceDate("2026-06-15", "monthly", 2)).toBe("2026-08-15");
  });

  it("clamps month-end overflow (Jan 31 -> Feb 28)", () => {
    expect(advanceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(advanceDate("2024-01-31", "monthly", 1)).toBe("2024-02-29"); // leap year
  });

  it("crosses year boundaries", () => {
    expect(advanceDate("2026-12-20", "daily", 15)).toBe("2027-01-04");
    expect(advanceDate("2026-11-15", "monthly", 3)).toBe("2027-02-15");
  });
});

describe("nextRunAfter", () => {
  it("returns the immediate next date when on schedule", () => {
    expect(nextRunAfter("2026-06-12", "daily", 1, "2026-06-12")).toBe("2026-06-13");
  });

  it("collapses missed periods into a single future date (no burst)", () => {
    // Due weekly from June 1, but cron last ran weeks ago; today is June 25.
    expect(nextRunAfter("2026-06-01", "weekly", 1, "2026-06-25")).toBe("2026-06-29");
  });

  it("advances past today even for far-future cadences", () => {
    expect(nextRunAfter("2026-01-15", "monthly", 1, "2026-06-12") > "2026-06-12").toBe(true);
  });
});

describe("cadenceLabel", () => {
  it("reads naturally", () => {
    expect(cadenceLabel("daily", 1)).toBe("Every day");
    expect(cadenceLabel("weekly", 1)).toBe("Weekly");
    expect(cadenceLabel("monthly", 1)).toBe("Monthly");
    expect(cadenceLabel("daily", 2)).toBe("Every 2 days");
    expect(cadenceLabel("weekly", 3)).toBe("Every 3 weeks");
  });
});
