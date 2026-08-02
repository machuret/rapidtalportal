/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PATCH } from "@/app/api/profile/route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const routeCtx = { params: Promise.resolve({}) };

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: "11111111-1111-4111-8111-111111111111" },
  });
});

it("rejects an invalid timezone before writing the profile", async () => {
  const response = await PATCH(new NextRequest("https://portal.test/api/profile", {
    method: "PATCH",
    body: JSON.stringify({ timezone: "Australia/Not-A-Place" }),
    headers: { "content-type": "application/json" },
  }), routeCtx);

  expect(response.status).toBe(422);
  expect(createAdminClient).not.toHaveBeenCalled();
});

it("persists a valid IANA timezone for the signed-in user only", async () => {
  const builder = {
    update: jest.fn(),
    eq: jest.fn(),
    select: jest.fn(),
    single: jest.fn().mockResolvedValue({
      data: { id: USER_ID, timezone: "Australia/Sydney" },
      error: null,
    }),
  };
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => builder) });

  const response = await PATCH(new NextRequest("https://portal.test/api/profile", {
    method: "PATCH",
    body: JSON.stringify({ timezone: "Australia/Sydney" }),
    headers: { "content-type": "application/json" },
  }), routeCtx);

  expect(response.status).toBe(200);
  expect(builder.update).toHaveBeenCalledWith({ timezone: "Australia/Sydney" });
  expect(builder.eq).toHaveBeenCalledWith("id", USER_ID);
});
