/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/vault-process-trigger", () => ({ triggerVaultProcess: jest.fn() }));
jest.mock("@/lib/rate-limit", () => {
  const actual = jest.requireActual("@/lib/rate-limit");
  return {
    ...actual,
    vaultUploadLimiter: {
      check: jest.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
    },
  };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { triggerVaultProcess } from "@/lib/vault-process-trigger";
import { vaultUploadLimiter } from "@/lib/rate-limit";
import { POST } from "@/app/api/vault/index-batch/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const RECENT = new Date(Date.now() - 60_000).toISOString();
const CANDIDATES = [
  { id: ITEM_A, client_id: CLIENT_ID, status: "ready", index_error: null, updated_at: RECENT },
  { id: ITEM_B, client_id: CLIENT_ID, status: "error", index_error: "boom", updated_at: RECENT },
];
const STRAGGLER = [{ id: ITEM_A, client_id: CLIENT_ID }];

function chain(result: { data?: unknown; error?: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of [
    "select", "eq", "in", "is", "or", "order", "limit",
    "insert", "update", "upsert", "delete",
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return builder;
}

/** Admin client whose vault_items reads resolve to `pages` in call order. */
function mockAdmin(pages: unknown[][]) {
  const builders = pages.map((data) => chain({ data, error: null }));
  let call = 0;
  const from = jest.fn(() => {
    const builder = builders[call] ?? chain({ data: [], error: null });
    call++;
    return builder;
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
  return { from, builders };
}

function request(body: unknown) {
  return new NextRequest("https://portal.test/api/vault/index-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
  (triggerVaultProcess as jest.Mock).mockResolvedValue(undefined);
});

test("rejects a missing clientId with 400 before touching the database", async () => {
  const response = await POST(request({}), { params: Promise.resolve({}) });

  expect(response.status).toBe(400);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(triggerVaultProcess).not.toHaveBeenCalled();
});

test("forbids indexing another tenant's vault", async () => {
  const response = await POST(request({ clientId: OTHER_CLIENT_ID }), { params: Promise.resolve({}) });

  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(triggerVaultProcess).not.toHaveBeenCalled();
});

test("rate-limits before doing any indexing work", async () => {
  (vaultUploadLimiter.check as jest.Mock).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });

  const response = await POST(request({ clientId: CLIENT_ID }), { params: Promise.resolve({}) });

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("42");
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(triggerVaultProcess).not.toHaveBeenCalled();
});

test("indexes every unindexed item for the client, scoped to that tenant", async () => {
  // First vault_items read = candidate scan; the between-rounds recheck then
  // finds everything indexed, so the sweep stops after one round.
  const { builders } = mockAdmin([CANDIDATES, []]);

  const response = await POST(request({ clientId: CLIENT_ID }), { params: Promise.resolve({}) });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual({ processed: 2, remaining: 0 });
  expect(builders[0].eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  expect(triggerVaultProcess).toHaveBeenCalledTimes(2);
  expect(triggerVaultProcess).toHaveBeenCalledWith(ITEM_A, CLIENT_ID);
  expect(triggerVaultProcess).toHaveBeenCalledWith(ITEM_B, CLIENT_ID);
});

test("re-triggers stragglers across rounds and reports them as remaining", async () => {
  // ITEM_A never finishes: scan, three between-rounds rechecks, final recheck.
  mockAdmin([CANDIDATES, STRAGGLER, STRAGGLER, STRAGGLER, STRAGGLER]);

  const response = await POST(request({ clientId: CLIENT_ID }), { params: Promise.resolve({}) });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual({ processed: 2, remaining: 1 });
  // Round 0: A + B; rounds 1–3: A alone each time.
  expect(triggerVaultProcess).toHaveBeenCalledTimes(5);
  for (const [, clientId] of (triggerVaultProcess as jest.Mock).mock.calls) {
    expect(clientId).toBe(CLIENT_ID);
  }
});

test("dead-letters error items that have been failing for more than 24h", async () => {
  const dead = [{
    id: ITEM_B,
    client_id: CLIENT_ID,
    status: "error",
    index_error: "permanent failure",
    updated_at: new Date(Date.now() - 25 * 3_600_000).toISOString(),
  }];
  mockAdmin([dead]);

  const response = await POST(request({ clientId: CLIENT_ID }), { params: Promise.resolve({}) });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual({ processed: 0, remaining: 0 });
  expect(triggerVaultProcess).not.toHaveBeenCalled();
});

test("no-ops cleanly when the client has nothing to index", async () => {
  mockAdmin([[]]);

  const response = await POST(request({ clientId: CLIENT_ID }), { params: Promise.resolve({}) });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual({ processed: 0, remaining: 0 });
  expect(triggerVaultProcess).not.toHaveBeenCalled();
});
