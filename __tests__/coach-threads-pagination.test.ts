/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { GET as getThreads } from "@/app/api/coach/threads/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const BEFORE = "2026-07-20T10:00:00.000Z";
const routeCtx = { params: Promise.resolve({}) };

type Result = { data: unknown; error: unknown };

function chain(result: Result, opts?: { maybeSingle?: Result }) {
  const c: Record<string, jest.Mock> & { then?: PromiseLike<unknown>["then"] } = {};
  for (const method of ["select", "eq", "lt", "order", "limit"]) c[method] = jest.fn(() => c);
  c.maybeSingle = jest.fn().mockResolvedValue(opts?.maybeSingle ?? result);
  c.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function turnRow(question: string, createdAt: string) {
  return {
    id: question,
    question,
    answer: `A: ${question}`,
    coach_mode: "private",
    brain_context_snapshot_id: "44444444-4444-4444-8444-444444444444",
    sources: [],
    suggestions: [],
    library_availability: "not_requested",
    warnings: [],
    action_draft: null,
    action_status: "none",
    created_at: createdAt,
  };
}

function mockDb(turnRows: unknown[], thread: unknown = { id: THREAD_ID }) {
  const threads = chain({ data: null, error: null }, { maybeSingle: { data: thread, error: null } });
  const turns = chain({ data: turnRows, error: null });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => (table === "coach_threads" ? threads : turns)),
  });
  return { threads, turns };
}

function get(url: string) {
  return getThreads(new NextRequest(url), routeCtx);
}

describe("Coach threads history pagination", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "client_admin" },
      impersonating: false,
    });
  });

  it("returns the newest 100 turns oldest-first, with hasMore when an older page exists", async () => {
    // The route fetches PAGE_SIZE + 1 rows (desc) to detect the older page.
    const rows = Array.from({ length: 101 }, (_, i) =>
      turnRow(`turn-${100 - i}`, `2026-08-01T00:${String(100 - i).padStart(2, "0")}:00Z`));
    const { turns } = mockDb(rows);

    const response = await get(`https://rapidtal.online/api/coach/threads?clientId=${CLIENT_ID}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.thread.id).toBe(THREAD_ID);
    expect(body.turns).toHaveLength(100);
    expect(body.hasMore).toBe(true);
    // Reversed for display: oldest of the page first, newest last.
    expect(body.turns[0].question).toBe("turn-1");
    expect(body.turns.at(-1).question).toBe("turn-100");
    expect(turns.limit).toHaveBeenCalledWith(101);
  });

  it("returns the page older than ?before= and reports hasMore false at the end", async () => {
    const rows = [
      turnRow("older-2", "2026-07-19T00:00:02Z"),
      turnRow("older-1", "2026-07-19T00:00:01Z"),
    ];
    const { turns } = mockDb(rows);

    const response = await get(
      `https://rapidtal.online/api/coach/threads?clientId=${CLIENT_ID}&before=${encodeURIComponent(BEFORE)}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(turns.lt).toHaveBeenCalledWith("created_at", BEFORE);
    expect(body.hasMore).toBe(false);
    expect(body.turns.map((t: { question: string }) => t.question)).toEqual(["older-1", "older-2"]);
  });

  it("rejects an invalid before cursor without touching the database", async () => {
    const response = await get(`https://rapidtal.online/api/coach/threads?clientId=${CLIENT_ID}&before=not-a-date`);
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("keeps the impersonation guard", async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "client_admin" },
      impersonating: true,
    });
    const response = await get(`https://rapidtal.online/api/coach/threads?clientId=${CLIENT_ID}`);
    expect(response.status).toBe(409);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns an empty page when there is no active thread", async () => {
    mockDb([], null);
    const response = await get(`https://rapidtal.online/api/coach/threads?clientId=${CLIENT_ID}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ thread: null, turns: [], hasMore: false });
  });
});
