import { sumWorkHours, workHours, isOnTime, onTimePct, isOverdue, daysOverdue } from "@/lib/tasks/metrics";

describe("isOverdue", () => {
  const today = "2026-06-16";
  it("flags in-flight work past its due date", () => {
    expect(isOverdue({ status: "todo", due_date: "2026-06-15" }, today)).toBe(true);
    expect(isOverdue({ status: "in_progress", due_date: "2026-06-01" }, today)).toBe(true);
  });
  it("does not flag work due today or in the future", () => {
    expect(isOverdue({ status: "todo", due_date: "2026-06-16" }, today)).toBe(false);
    expect(isOverdue({ status: "in_progress", due_date: "2026-06-20" }, today)).toBe(false);
  });
  it("ignores review/done and tasks with no due date", () => {
    expect(isOverdue({ status: "review", due_date: "2026-06-01" }, today)).toBe(false);
    expect(isOverdue({ status: "done", due_date: "2026-06-01" }, today)).toBe(false);
    expect(isOverdue({ status: "todo", due_date: null }, today)).toBe(false);
  });
});

describe("daysOverdue", () => {
  it("counts whole days between due date and today", () => {
    expect(daysOverdue("2026-06-15", "2026-06-16")).toBe(1);
    expect(daysOverdue("2026-06-01", "2026-06-16")).toBe(15);
  });
  it("spans month boundaries", () => {
    expect(daysOverdue("2026-05-31", "2026-06-02")).toBe(2);
  });
});

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
