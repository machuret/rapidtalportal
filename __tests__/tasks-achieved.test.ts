import { computeAchieved, type AchievedTask } from "@/lib/tasks/achieved";

// Fixed "now": Wednesday 2026-06-17 12:00 local. Week starts Mon 2026-06-15.
const NOW = new Date(2026, 5, 17, 12, 0, 0);
const t = (over: Partial<AchievedTask>): AchievedTask =>
  ({ title: "x", status: "done", completed_at: null, due_date: null, ...over });

describe("computeAchieved", () => {
  it("counts done this week, this month, and total", () => {
    const tasks = [
      t({ completed_at: "2026-06-16T09:00:00" }), // this week + month
      t({ completed_at: "2026-06-03T09:00:00" }), // this month, not this week
      t({ completed_at: "2026-05-20T09:00:00" }), // earlier month
      t({ status: "todo" }),                       // not done
    ];
    const r = computeAchieved(tasks, NOW);
    expect(r.week).toBe(1);
    expect(r.month).toBe(2);
    expect(r.total).toBe(3);
  });

  it("counts legacy done tasks without a timestamp in total only", () => {
    const r = computeAchieved([t({ completed_at: null })], NOW);
    expect(r.total).toBe(1);
    expect(r.week).toBe(0);
    expect(r.month).toBe(0);
  });

  it("computes on-time percentage over due-dated completions", () => {
    const tasks = [
      t({ completed_at: "2026-06-16T09:00:00", due_date: "2026-06-16" }), // on time (same day)
      t({ completed_at: "2026-06-16T09:00:00", due_date: "2026-06-20" }), // early
      t({ completed_at: "2026-06-16T09:00:00", due_date: "2026-06-10" }), // late
      t({ completed_at: "2026-06-16T09:00:00", due_date: null }),         // ignored
    ];
    const r = computeAchieved(tasks, NOW);
    expect(r.onTimePct).toBe(67); // 2 of 3
  });

  it("returns null on-time when nothing had a due date", () => {
    expect(computeAchieved([t({ completed_at: "2026-06-16T09:00:00" })], NOW).onTimePct).toBeNull();
  });

  it("returns the 5 most recent completions, newest first", () => {
    const tasks = Array.from({ length: 7 }, (_, i) =>
      t({ title: `task-${i}`, completed_at: `2026-06-1${i}T09:00:00` }),
    );
    const r = computeAchieved(tasks, NOW);
    expect(r.recent).toHaveLength(5);
    expect(r.recent[0].title).toBe("task-6");
  });
});
