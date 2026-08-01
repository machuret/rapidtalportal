/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET as coachProactive } from "@/app/api/cron/coach-proactive/route";
import {
  scanProactiveTriggers,
  hasTriggers,
  validateDraftAgainstContext,
} from "@/lib/coach/proactive";

const TASK_ID = "33333333-3333-4333-8333-333333333333";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";

const task = (over: Partial<Parameters<typeof scanProactiveTriggers>[0][number]>) => ({
  taskId: TASK_ID,
  title: "Prepare campaign brief",
  status: "todo",
  dueDate: null,
  priority: 2,
  assignedTo: TEAM_ID,
  assignedName: "Michelle",
  ...over,
});

describe("proactive trigger scan", () => {
  const today = "2026-08-03";

  it("counts overdue, due-this-week, unassigned and review work", () => {
    const triggers = scanProactiveTriggers([
      task({ dueDate: "2026-08-01" }),                    // overdue
      task({ dueDate: "2026-08-06" }),                    // this week
      task({ assignedTo: null, assignedName: null }),     // unassigned
      task({ status: "review" }),                         // awaiting review
      task({ status: "done", dueDate: "2026-08-01" }),    // done — never counts
    ], today);
    expect(triggers).toEqual({ overdue: 1, dueThisWeek: 1, unassigned: 1, awaitingReview: 1 });
    expect(hasTriggers(triggers)).toBe(true);
  });

  it("is quiet when nothing needs attention", () => {
    const triggers = scanProactiveTriggers([
      task({ dueDate: "2026-09-01" }),
      task({ status: "done" }),
    ], today);
    expect(hasTriggers(triggers)).toBe(false);
  });

  it("never flags work in review or done as overdue/unassigned", () => {
    const triggers = scanProactiveTriggers([
      task({ status: "review", dueDate: "2026-07-01", assignedTo: null }),
      task({ status: "done", dueDate: "2026-07-01", assignedTo: null }),
    ], today);
    expect(triggers.overdue).toBe(0);
    expect(triggers.unassigned).toBe(0);
    expect(triggers.awaitingReview).toBe(1);
  });
});

describe("draft validation against resolved context", () => {
  const team = [{ userId: TEAM_ID, displayName: "Michelle", role: "va" }];
  const tasks = [task({})];

  it("keeps drafts that reference supplied team members and tasks", () => {
    expect(validateDraftAgainstContext(
      { type: "create_task", title: "Follow up", brief: "", assigneeId: TEAM_ID, priority: 2, dueDate: null },
      team, tasks,
    )).not.toBeNull();
    expect(validateDraftAgainstContext(
      { type: "update_task", taskId: TASK_ID, note: "" },
      team, tasks,
    )).not.toBeNull();
  });

  it("drops drafts that invent people or tasks", () => {
    expect(validateDraftAgainstContext(
      { type: "create_task", title: "Ghost", brief: "", assigneeId: OTHER_ID, priority: 2, dueDate: null },
      team, tasks,
    )).toBeNull();
    expect(validateDraftAgainstContext(
      { type: "update_task", taskId: OTHER_ID, note: "" },
      team, tasks,
    )).toBeNull();
  });

  it("allows unassigned create_task drafts", () => {
    expect(validateDraftAgainstContext(
      { type: "create_task", title: "Anyone", brief: "", assigneeId: null, priority: 3, dueDate: null },
      team, tasks,
    )).not.toBeNull();
  });
});

describe("GET /api/cron/coach-proactive", () => {
  const SECRET = "test-cron-secret";

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => { delete process.env.CRON_SECRET; });

  function call(auth?: string) {
    return coachProactive(new NextRequest("https://portal.test/api/cron/coach-proactive", {
      headers: auth ? { authorization: auth } : {},
    }));
  }

  it("rejects requests without the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await call(`Bearer ${SECRET}`)).status).toBe(401);
  });
});
