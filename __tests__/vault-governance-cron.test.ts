/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/notifications", () => ({ notify: jest.fn(), clientAdminIds: jest.fn() }));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, clientAdminIds } from "@/lib/notifications";
import { GET } from "@/app/api/cron/vault-governance/route";

const SECRET = "test-cron-secret";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

/** Admin client: vault_items update resolves to `rows`, heartbeats no-op. */
function mockAdmin(rows: unknown[]) {
  const vault = chain({ data: rows, error: null });
  const heartbeat = chain({ data: null, error: null });
  const from = jest.fn((table: string) => {
    if (table === "vault_items") return vault;
    if (table === "cron_heartbeats") return heartbeat;
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
  return { vault, heartbeat };
}

function cronRequest(auth?: string) {
  return new NextRequest("https://portal.test/api/cron/vault-governance", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  (clientAdminIds as jest.Mock).mockResolvedValue([ADMIN_A]);
  (notify as jest.Mock).mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(cronRequest());

  expect(response.status).toBe(401);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

test("transitions only active items whose review/validity date has passed", async () => {
  const { vault } = mockAdmin([]);

  const response = await GET(cronRequest(`Bearer ${SECRET}`));

  expect(response.status).toBe(200);
  expect(vault.update).toHaveBeenCalledWith({ knowledge_status: "review_required" });
  // Idempotency guard: only ever 'active' rows, so an item transitions once.
  expect(vault.eq).toHaveBeenCalledWith("knowledge_status", "active");
  const orFilter = vault.or.mock.calls[0][0] as string;
  expect(orFilter).toMatch(/^review_due_at\.lt\..+,valid_until\.lt\..+$/);
});

test("notifies each affected client's admins once, with the per-client count", async () => {
  mockAdmin([
    { id: "item-1", client_id: CLIENT_ID },
    { id: "item-2", client_id: CLIENT_ID },
    { id: "item-3", client_id: OTHER_CLIENT_ID },
  ]);
  (clientAdminIds as jest.Mock).mockImplementation(async (clientId: string) =>
    clientId === CLIENT_ID ? [ADMIN_A, ADMIN_B] : [ADMIN_A]);

  const response = await GET(cronRequest(`Bearer ${SECRET}`));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({ ok: true, transitioned: 3, clients: 2 });
  expect(notify).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenCalledWith([ADMIN_A, ADMIN_B], {
    clientId: CLIENT_ID,
    type: "vault_review",
    title: "2 vault sources need review",
    href: "/vault",
  });
  expect(notify).toHaveBeenCalledWith([ADMIN_A], {
    clientId: OTHER_CLIENT_ID,
    type: "vault_review",
    title: "1 vault source needs review",
    href: "/vault",
  });
});

test("sends no notifications when nothing transitioned (no daily spam)", async () => {
  mockAdmin([]);

  const response = await GET(cronRequest(`Bearer ${SECRET}`));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({ ok: true, transitioned: 0, clients: 0 });
  expect(clientAdminIds).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

test("records a heartbeat on every run so /admin/health sees the cron alive", async () => {
  const { heartbeat } = mockAdmin([{ id: "item-1", client_id: CLIENT_ID }]);

  const response = await GET(cronRequest(`Bearer ${SECRET}`));

  expect(response.status).toBe(200);
  expect(heartbeat.upsert).toHaveBeenCalledWith(expect.objectContaining({
    name: "vault-governance",
    detail: expect.objectContaining({ transitioned: 1, clients: 1 }),
  }));
});
