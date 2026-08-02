/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { GET as runCrawls } from "@/app/api/cron/vault-crawls/route";
import { POST as advanceCrawl } from "@/app/api/vault/crawl-site/advance/route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = "cron-test-secret";
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

it("rejects an unauthenticated background crawl sweep", async () => {
  const response = await runCrawls(new NextRequest("https://portal.test/api/cron/vault-crawls"));
  expect(response.status).toBe(401);
  expect(createAdminClient).not.toHaveBeenCalled();
});

it("allows the signed background worker to inspect a terminal crawl without user auth", async () => {
  const terminalJob = {
    id: JOB_ID,
    client_id: "22222222-2222-4222-8222-222222222222",
    created_by: "33333333-3333-4333-8333-333333333333",
    url: "https://example.com",
    status: "done",
  };
  const builder = {
    select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({ data: terminalJob, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => builder) });

  const response = await advanceCrawl(new NextRequest("https://portal.test/api/vault/crawl-site/advance", {
    method: "POST",
    headers: { authorization: "Bearer cron-test-secret", "content-type": "application/json" },
    body: JSON.stringify({ jobId: JOB_ID }),
  }));

  expect(response.status).toBe(200);
  expect(requireApiAuth).not.toHaveBeenCalled();
  expect((await response.json()).job.status).toBe("done");
});
