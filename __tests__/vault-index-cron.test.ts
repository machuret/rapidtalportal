/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/vault-process-trigger", () => ({ triggerVaultProcess: jest.fn() }));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerVaultProcess } from "@/lib/vault-process-trigger";
import { GET } from "@/app/api/cron/vault-index/route";

const SECRET = "test-cron-secret";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function cronRequest(auth?: string) {
  return new NextRequest("https://portal.test/api/cron/vault-index", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  (triggerVaultProcess as jest.Mock).mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(cronRequest());

  expect(response.status).toBe(401);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(triggerVaultProcess).not.toHaveBeenCalled();
});

test("sweeps globally (no tenant scope) and records a heartbeat", async () => {
  const candidates = [{
    id: ITEM_A,
    client_id: CLIENT_ID,
    status: "ready",
    index_error: null,
    updated_at: new Date(Date.now() - 60_000).toISOString(),
  }];
  // vault_items reads: candidate scan, then the recheck finds it indexed.
  const vaultBuilders = [chain({ data: candidates, error: null }), chain({ data: [], error: null })];
  let vaultCall = 0;
  const heartbeat = chain({ data: null, error: null });
  const from = jest.fn((table: string) => {
    if (table === "cron_heartbeats") return heartbeat;
    if (table === "vault_items") {
      const builder = vaultBuilders[vaultCall] ?? chain({ data: [], error: null });
      vaultCall++;
      return builder;
    }
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });

  const response = await GET(cronRequest(`Bearer ${SECRET}`));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({ ok: true, scanned: 1, candidates: 1, calls: 1, remaining: 0 });
  // Global backstop: the candidate query must NOT be scoped to a client.
  expect(vaultBuilders[0].eq).not.toHaveBeenCalled();
  expect(triggerVaultProcess).toHaveBeenCalledTimes(1);
  expect(triggerVaultProcess).toHaveBeenCalledWith(ITEM_A, CLIENT_ID);
  expect(heartbeat.upsert).toHaveBeenCalledWith(expect.objectContaining({
    name: "vault-index",
    detail: expect.objectContaining({ scanned: 1, candidates: 1, indexed: 1, remaining: 0 }),
  }));
});

test("heartbeats a no-op run so /admin/health sees the cron alive", async () => {
  const heartbeat = chain({ data: null, error: null });
  const from = jest.fn((table: string) => {
    if (table === "cron_heartbeats") return heartbeat;
    if (table === "vault_items") return chain({ data: [], error: null });
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });

  const response = await GET(cronRequest(`Bearer ${SECRET}`));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({ ok: true, scanned: 0, candidates: 0, calls: 0, remaining: 0 });
  expect(triggerVaultProcess).not.toHaveBeenCalled();
  expect(heartbeat.upsert).toHaveBeenCalledWith(expect.objectContaining({
    name: "vault-index",
    detail: expect.objectContaining({ scanned: 0, indexed: 0 }),
  }));
});
