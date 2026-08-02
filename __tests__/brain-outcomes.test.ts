import {
  computeCoachActionOutcomes,
  computeContentKept,
  computeOpportunityEffectiveness,
  type CoachReceiptRow,
  type OutcomeTaskRow,
} from "@/lib/brain/outcomes";

function receipt(overrides: Partial<CoachReceiptRow>): CoachReceiptRow {
  return {
    id: "r1",
    action_type: "create_task",
    status: "completed",
    owner_id: "owner-1",
    payload: { title: "Call the supplier", brief: "…" },
    result: null,
    created_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<OutcomeTaskRow>): OutcomeTaskRow {
  return {
    id: "t1",
    title: "Call the supplier",
    status: "done",
    created_by: "owner-1",
    created_at: "2026-07-01T10:00:05.000Z",
    completed_at: "2026-07-03T10:00:05.000Z", // 48h later
    ...overrides,
  };
}

describe("computeCoachActionOutcomes", () => {
  it("links via result.taskId (the RPC's explicit link) and measures time-to-done", () => {
    const stats = computeCoachActionOutcomes(
      [receipt({ result: { taskId: "t9", title: "x" } })],
      [task({ id: "t9", title: "anything — link wins" })],
    );
    expect(stats.createTask).toEqual({ completed: 1, linked: 1, done: 1, medianHoursToDone: 48 });
  });

  it("falls back to owner + payload title + same-minute match when result lacks a link", () => {
    const stats = computeCoachActionOutcomes([receipt({})], [task({})]);
    expect(stats.createTask.linked).toBe(1);
    expect(stats.createTask.done).toBe(1);
  });

  it("matches titles the way the RPC stores them (trimmed, capped at 300 chars)", () => {
    const padded = `  ${"a".repeat(320)}  `;
    const stats = computeCoachActionOutcomes(
      [receipt({ payload: { title: padded } })],
      [task({ title: "a".repeat(300) })],
    );
    expect(stats.createTask.linked).toBe(1);
  });

  it("rejects heuristic matches outside the window, by another owner, or with a different title", () => {
    const base = receipt({});
    expect(computeCoachActionOutcomes([base], [task({ created_by: "someone-else" })]).createTask.linked).toBe(0);
    expect(computeCoachActionOutcomes([base], [task({ title: "Different title" })]).createTask.linked).toBe(0);
    expect(
      computeCoachActionOutcomes([base], [task({ created_at: "2026-07-01T10:02:00.000Z" })]).createTask.linked,
    ).toBe(0);
  });

  it("picks the nearest same-minute candidate and ignores unlinked receipts in the ratio", () => {
    const receipts = [
      receipt({ id: "r1", result: { taskId: "t-done" } }),
      receipt({ id: "r2", payload: { title: "Ghost task" } }), // no match anywhere
    ];
    const stats = computeCoachActionOutcomes(receipts, [task({ id: "t-done" })]);
    expect(stats.createTask).toEqual({ completed: 2, linked: 1, done: 1, medianHoursToDone: 48 });
  });

  it("computes the median over finished tasks and groups receipts by type/status", () => {
    const receipts = [
      receipt({ id: "r1", result: { taskId: "t1" } }),
      receipt({ id: "r2", result: { taskId: "t2" } }),
      receipt({ id: "r3", action_type: "send_message", status: "failed", result: null }),
      receipt({ id: "r4", action_type: "update_task", status: "processing", result: null }),
    ];
    const tasks = [
      task({ id: "t1", completed_at: "2026-07-01T20:00:05.000Z" }), // 10h
      task({ id: "t2", status: "in_progress", completed_at: null }),
    ];
    const stats = computeCoachActionOutcomes(receipts, tasks);
    expect(stats.createTask.medianHoursToDone).toBe(10);
    expect(stats.createTask.done).toBe(1);
    expect(stats.total).toBe(4);
    expect(stats.byType).toContainEqual({ type: "create_task", completed: 2, failed: 0, processing: 0 });
    expect(stats.byType).toContainEqual({ type: "send_message", completed: 0, failed: 1, processing: 0 });
    expect(stats.byType).toContainEqual({ type: "update_task", completed: 0, failed: 0, processing: 1 });
  });
});

describe("computeContentKept", () => {
  it("reports honestly when there are no comparable pieces", () => {
    expect(computeContentKept([])).toEqual({ pieces: 0, avgKeptPct: null });
    expect(computeContentKept([{ id: "p1", ai_original: "draft", body: null }])).toEqual({ pieces: 0, avgKeptPct: null });
  });

  it("averages word-level similarity between the AI draft and the approved body", () => {
    const stats = computeContentKept([
      { id: "p1", ai_original: "the quick brown fox", body: "the quick brown fox" }, // 100%
      { id: "p2", ai_original: "alpha beta gamma", body: "delta epsilon zeta" }, // 0%
    ]);
    expect(stats.pieces).toBe(2);
    expect(stats.avgKeptPct).toBe(50);
  });
});

describe("computeOpportunityEffectiveness", () => {
  it("buckets effectiveness and counts completed opportunities", () => {
    const stats = computeOpportunityEffectiveness([
      { id: "o1", status: "completed", effectiveness_status: "effective" },
      { id: "o2", status: "completed", effectiveness_status: "mixed" },
      { id: "o3", status: "in_progress", effectiveness_status: "measuring" },
      { id: "o4", status: "suggested", effectiveness_status: "unmeasured" },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.completed).toBe(2);
    expect(stats.distribution).toEqual([
      { status: "unmeasured", count: 1 },
      { status: "measuring", count: 1 },
      { status: "effective", count: 1 },
      { status: "mixed", count: 1 },
      { status: "ineffective", count: 0 },
    ]);
  });
});
