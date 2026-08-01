/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/notifications", () => ({ notify: jest.fn() }));
jest.mock("@/lib/brain/opportunities", () => {
  const actual = jest.requireActual("@/lib/brain/opportunities");
  return { ...actual, runBrainDiagnostic: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { runBrainDiagnostic } from "@/lib/brain/opportunities";
import { GET as opportunitiesCron } from "@/app/api/cron/brain-opportunities/route";

const SECRET = "test-cron-secret";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

function mockAdmin() {
  const from = jest.fn((table: string) => {
    const chain: Record<string, jest.Mock> & { then?: PromiseLike<unknown>["then"] } = {};
    for (const m of ["select", "is", "eq", "order", "limit", "gte"]) chain[m] = jest.fn(() => chain);
    chain.upsert = jest.fn().mockResolvedValue({ error: null });
    chain.then = (resolve) => {
      const result = table === "clients"
        ? { data: [{ id: CLIENT_ID }], error: null }
        : table === "brain_diagnostic_runs"
          ? { data: [], error: null }
          : table === "users"
            ? { data: [{ id: ADMIN_ID }], error: null }
            : { data: [], error: null };
      return Promise.resolve(result).then(resolve);
    };
    return chain;
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
}

function call() {
  return opportunitiesCron(new NextRequest("https://portal.test/api/cron/brain-opportunities", {
    headers: { authorization: `Bearer ${SECRET}` },
  }));
}

describe("GET /api/cron/brain-opportunities notifications", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockAdmin();
  });
  afterEach(() => { delete process.env.CRON_SECRET; });

  it("notifies client admins when new opportunities are created", async () => {
    (runBrainDiagnostic as jest.Mock).mockResolvedValue({
      runId: "r1", snapshotId: "s1", created: 2,
      createdTitles: ["Publish a pricing page", "Answer recurring pricing questions"],
      libraryAvailability: "available",
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledWith([ADMIN_ID], expect.objectContaining({
      clientId: CLIENT_ID,
      type: "brain_opportunity",
      href: "/brain",
    }));
    expect((notify as jest.Mock).mock.calls[0][1].title).toContain("2 new opportunities");
  });

  it("stays silent when nothing new is created", async () => {
    (runBrainDiagnostic as jest.Mock).mockResolvedValue({
      runId: "r1", snapshotId: "s1", created: 0, createdTitles: [],
      libraryAvailability: "available",
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });
});
