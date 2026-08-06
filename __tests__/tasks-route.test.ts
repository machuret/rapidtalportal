/**
 * @jest-environment node
 *
 * Task board route tests — the board is shared per client, so the rules are:
 *   - VAs may only move/edit cards assigned to or created by them;
 *   - only admins may reassign a card to someone else;
 *   - no one can touch another client's cards.
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { PATCH } from "@/app/api/tasks/route";

type Result = { data: unknown; error: unknown };

function makeAdmin(results: Record<string, Result>) {
  return {
    from(table: string) {
      const result = results[table] ?? { data: null, error: null };
      const b: Record<string, unknown> = {};
      const ret = () => b;
      b.select = ret; b.insert = ret; b.update = ret; b.delete = ret; b.eq = ret; b.order = ret;
      b.maybeSingle = async () => result;
      b.single = async () => result;
      b.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve);
      return b;
    },
  };
}

// Route schemas require UUIDs.
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";
const OTHER_VA = "44444444-4444-4444-8444-444444444444";
const VA_ID = "55555555-5555-4555-8555-555555555555";

const asAuth = (user: ApiUser) => (requireApiAuth as jest.Mock).mockResolvedValue({ user });
const jsonReq = (body: unknown) => ({ json: async () => body }) as never;
const routeCtx = { params: Promise.resolve({}) };

beforeEach(() => jest.clearAllMocks());

test("a VA cannot move another teammate's card", async () => {
  asAuth({ id: VA_ID, role: "va", client_id: CLIENT_A });
  (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
    tasks: { data: { client_id: CLIENT_A, assigned_to: OTHER_VA, created_by: OTHER_VA }, error: null },
  }));
  const res = await PATCH(jsonReq({ id: TASK, status: "done" }), routeCtx);
  expect(res.status).toBe(403);
});

test("a VA cannot touch a card on another client's board", async () => {
  asAuth({ id: VA_ID, role: "va", client_id: CLIENT_A });
  (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
    tasks: { data: { client_id: CLIENT_B, assigned_to: VA_ID, created_by: VA_ID }, error: null },
  }));
  const res = await PATCH(jsonReq({ id: TASK, status: "done" }), routeCtx);
  expect(res.status).toBe(403);
});

test("a VA cannot reassign a card to someone else", async () => {
  asAuth({ id: VA_ID, role: "va", client_id: CLIENT_A });
  (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
    tasks: { data: { client_id: CLIENT_A, assigned_to: VA_ID, created_by: VA_ID }, error: null },
  }));
  const res = await PATCH(jsonReq({ id: TASK, assignedTo: OTHER_VA }), routeCtx);
  expect(res.status).toBe(403);
});

test("a VA can move their own card", async () => {
  asAuth({ id: VA_ID, role: "va", client_id: CLIENT_A });
  (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
    tasks: { data: { id: TASK, client_id: CLIENT_A, assigned_to: VA_ID, created_by: VA_ID, status: "done" }, error: null },
  }));
  const res = await PATCH(jsonReq({ id: TASK, status: "done" }), routeCtx);
  expect(res.status).toBe(200);
});

test("a VA cannot finalise their own card as done — the review gate is admin-only", async () => {
  asAuth({ id: VA_ID, role: "va", client_id: CLIENT_A });
  (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
    tasks: { data: { id: TASK, client_id: CLIENT_A, assigned_to: VA_ID, created_by: VA_ID, status: "in_progress" }, error: null },
  }));
  const res = await PATCH(jsonReq({ id: TASK, status: "done" }), routeCtx);
  expect(res.status).toBe(403);
});

test("the done guard doesn't over-block a VA's normal move (todo → in_progress)", async () => {
  asAuth({ id: VA_ID, role: "va", client_id: CLIENT_A });
  (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
    tasks: { data: { id: TASK, title: "Test task", client_id: CLIENT_A, assigned_to: VA_ID, created_by: VA_ID, status: "todo" }, error: null },
  }));
  const res = await PATCH(jsonReq({ id: TASK, status: "in_progress" }), routeCtx);
  expect(res.status).toBe(200);
});

test("an admin may finalise a card as done", async () => {
  asAuth({ id: OTHER_VA, role: "client_admin", client_id: CLIENT_A });
  (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
    tasks: { data: { id: TASK, title: "Test task", client_id: CLIENT_A, assigned_to: VA_ID, created_by: VA_ID, status: "in_progress" }, error: null },
  }));
  const res = await PATCH(jsonReq({ id: TASK, status: "done" }), routeCtx);
  expect(res.status).toBe(200);
});
