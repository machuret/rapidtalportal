import { computeVaStats, blankVaStats, vaOnTimePct, vaFlags } from "@/lib/va/stats";

const DAY = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const dateDaysAgo = (n: number) => isoDaysAgo(n).slice(0, 10);
const dateInDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

describe("blankVaStats", () => {
  it("is all zero/empty", () => {
    expect(blankVaStats()).toEqual({
      delivered: 0, onTimeNum: 0, onTimeDen: 0, reviewing: 0, inProgress: 0,
      overdue: 0, dueSoon: 0, hours: 0, logs: 0, lastLog: "", lastActive: 0,
    });
  });
});

describe("vaOnTimePct", () => {
  it("is null when no delivered task had a due date", () => {
    expect(vaOnTimePct(blankVaStats())).toBeNull();
  });
  it("rounds the percentage", () => {
    expect(vaOnTimePct({ ...blankVaStats(), onTimeNum: 1, onTimeDen: 3 })).toBe(33);
    expect(vaOnTimePct({ ...blankVaStats(), onTimeNum: 2, onTimeDen: 3 })).toBe(67);
    expect(vaOnTimePct({ ...blankVaStats(), onTimeNum: 3, onTimeDen: 3 })).toBe(100);
  });
});

describe("vaFlags", () => {
  const today = "2026-08-02";

  it("flags a VA with no stats as missing logs", () => {
    expect(vaFlags(undefined, today)).toEqual([{ text: "No daily log this month", kind: "warn" }]);
  });

  it("leads with overdue, then the client's action item, then hygiene", () => {
    const s = { ...blankVaStats(), overdue: 2, reviewing: 3, dueSoon: 1, inProgress: 4, delivered: 0, lastLog: "2026-07-28" };
    expect(vaFlags(s, today)).toEqual([
      { text: "2 overdue", kind: "alert" },
      { text: "3 awaiting your review", kind: "action" },
      { text: "1 due soon", kind: "warn" },
      { text: "No log for 5 days", kind: "warn" },
      { text: "Active tasks, nothing delivered yet", kind: "warn" },
    ]);
  });

  it("only flags a stale log at 3+ days", () => {
    expect(vaFlags({ ...blankVaStats(), lastLog: "2026-07-31" }, today)).toEqual([]);
    expect(vaFlags({ ...blankVaStats(), lastLog: today }, today)).toEqual([]);
    expect(vaFlags({ ...blankVaStats(), lastLog: "2026-07-30" }, today)).toEqual([
      { text: "No log for 3 days", kind: "warn" },
    ]);
  });

  it("does not flag active-but-undelivered once something is delivered", () => {
    const s = { ...blankVaStats(), inProgress: 2, delivered: 1, lastLog: today };
    expect(vaFlags(s, today)).toEqual([]);
  });
});

// computeVaStats speaks to a Supabase client; a thenable, chainable stub
// stands in so the aggregation itself is tested end to end.
type Rows = Record<string, unknown>[];
type Admin = Parameters<typeof computeVaStats>[0];

function thenableQuery(rows: Rows, calls: string[]) {
  const q = Promise.resolve({ data: rows }) as Promise<{ data: Rows }> &
    Record<string, (...args: unknown[]) => unknown>;
  for (const m of ["select", "in", "eq", "gte", "is", "or", "order", "limit"]) {
    q[m] = (...args: unknown[]) => {
      calls.push(`${m}(${args.map(String).join(",")})`);
      return q;
    };
  }
  return q;
}

function mockAdmin(data: { logs?: Rows; times?: Rows; tasks?: Rows }) {
  const calls: Record<string, string[]> = { daily_logs: [], time_entries: [], tasks: [] };
  let fromCalls = 0;
  const admin = {
    from(table: string) {
      fromCalls++;
      const rows =
        table === "daily_logs" ? data.logs ?? []
        : table === "time_entries" ? data.times ?? []
        : data.tasks ?? [];
      return thenableQuery(rows, (calls[table] ??= []));
    },
  };
  return { admin: admin as unknown as Admin, calls, fromCount: () => fromCalls };
}

describe("computeVaStats", () => {
  const start = new Date(Date.now() - DAY);
  const twoHours: Rows = [
    { user_id: "va1", started_at: start.toISOString(), ended_at: new Date(start.getTime() + 2 * 3_600_000).toISOString() },
    { user_id: "va1", started_at: start.toISOString(), ended_at: null }, // open entry — not counted
  ];
  const logs: Rows = [
    { user_id: "va1", log_date: dateDaysAgo(5), updated_at: isoDaysAgo(5) },
    { user_id: "va1", log_date: dateDaysAgo(1), updated_at: isoDaysAgo(1) },
  ];
  const tasks: Rows = [
    // Done in window, on time (completed before due end-of-day).
    { assigned_to: "va1", status: "done", updated_at: isoDaysAgo(2), completed_at: isoDaysAgo(2), due_date: dateDaysAgo(1) },
    // Done in window, late.
    { assigned_to: "va1", status: "done", updated_at: isoDaysAgo(1), completed_at: isoDaysAgo(1), due_date: dateDaysAgo(3) },
    // Done outside the window — must not count.
    { assigned_to: "va1", status: "done", updated_at: isoDaysAgo(40), completed_at: isoDaysAgo(40), due_date: dateDaysAgo(41) },
    // Awaiting the client's review.
    { assigned_to: "va1", status: "review", updated_at: isoDaysAgo(1), completed_at: null, due_date: null },
    // Overdue / due soon / just active.
    { assigned_to: "va1", status: "in_progress", updated_at: isoDaysAgo(1), completed_at: null, due_date: dateDaysAgo(1) },
    { assigned_to: "va1", status: "todo", updated_at: isoDaysAgo(1), completed_at: null, due_date: dateInDays(1) },
    { assigned_to: "va1", status: "todo", updated_at: isoDaysAgo(1), completed_at: null, due_date: dateInDays(10) },
    // Unassigned row — skipped.
    { assigned_to: null, status: "todo", updated_at: isoDaysAgo(1), completed_at: null, due_date: null },
  ];

  it("aggregates outcomes, hours and logs per VA", async () => {
    const { admin } = mockAdmin({ logs, times: twoHours, tasks });
    const stats = await computeVaStats(admin, ["va1", "va2"], "client-1", 30);

    const s = stats.va1;
    expect(s.delivered).toBe(2);
    expect(s.onTimeNum).toBe(1);
    expect(s.onTimeDen).toBe(2);
    expect(vaOnTimePct(s)).toBe(50);
    expect(s.reviewing).toBe(1);
    expect(s.inProgress).toBe(3);
    expect(s.overdue).toBe(1);
    expect(s.dueSoon).toBe(1);
    expect(s.hours).toBe(2);
    expect(s.logs).toBe(2);
    expect(s.lastLog).toBe(dateDaysAgo(1));
    expect(s.lastActive).toBeGreaterThan(0);

    // A VA with no activity in the window has no entry.
    expect(stats.va2).toBeUndefined();
  });

  it("scopes every data query by client_id when given one", async () => {
    const { admin, calls } = mockAdmin({});
    await computeVaStats(admin, ["va1"], "client-1", 30);
    for (const table of ["daily_logs", "time_entries", "tasks"]) {
      expect(calls[table]).toContain("eq(client_id,client-1)");
    }
  });

  it("omits the client filter for cross-tenant (null clientId) reads", async () => {
    const { admin, calls } = mockAdmin({});
    await computeVaStats(admin, ["va1"], null, 30);
    for (const table of ["daily_logs", "time_entries", "tasks"]) {
      expect(calls[table].some((c) => c.startsWith("eq(client_id,"))).toBe(false);
    }
  });

  it("returns no stats and runs no queries for an empty VA list", async () => {
    const { admin, fromCount } = mockAdmin({});
    await expect(computeVaStats(admin, [], "client-1", 30)).resolves.toEqual({});
    expect(fromCount()).toBe(0);
  });
});
