import { sumWorkHours, workHours, isOnTime, onTimePct } from "@/lib/tasks/metrics";

describe("sumWorkHours / workHours", () => {
  it("sums closed entries and ignores open ones", () => {
    const entries = [
      { started_at: "2026-06-01T09:00:00Z", ended_at: "2026-06-01T11:00:00Z" }, // 2h
      { started_at: "2026-06-01T13:00:00Z", ended_at: "2026-06-01T13:30:00Z" }, // 0.5h
      { started_at: "2026-06-01T15:00:00Z", ended_at: null },                   // open → ignored
    ];
    expect(sumWorkHours(entries)).toBeCloseTo(2.5, 5);
    expect(workHours(entries)).toBe(2.5);
  });
  it("is zero for no closed entries", () => {
    expect(sumWorkHours([{ started_at: "2026-06-01T09:00:00Z", ended_at: null }])).toBe(0);
  });
});

describe("isOnTime", () => {
  it("counts same-day completion as on time", () => {
    expect(isOnTime("2026-06-10T23:00:00", "2026-06-10")).toBe(true);
  });
  it("counts completion after the due day as late", () => {
    expect(isOnTime("2026-06-11T00:30:00", "2026-06-10")).toBe(false);
  });
  it("counts early completion as on time", () => {
    expect(isOnTime("2026-06-05T10:00:00", "2026-06-10")).toBe(true);
  });
});

describe("onTimePct", () => {
  it("computes % over due-dated completions only", () => {
    const tasks = [
      { completed_at: "2026-06-10T10:00:00", due_date: "2026-06-10" }, // on time
      { completed_at: "2026-06-12T10:00:00", due_date: "2026-06-10" }, // late
      { completed_at: "2026-06-09T10:00:00", due_date: "2026-06-10" }, // on time
      { completed_at: "2026-06-09T10:00:00", due_date: null },         // ignored
      { completed_at: null, due_date: "2026-06-10" },                  // ignored
    ];
    expect(onTimePct(tasks)).toBe(67); // 2 of 3
  });
  it("returns null when nothing had a due date", () => {
    expect(onTimePct([{ completed_at: "2026-06-10T10:00:00", due_date: null }])).toBeNull();
  });
});
