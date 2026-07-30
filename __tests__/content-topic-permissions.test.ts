/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DELETE,
  PATCH,
} from "@/app/api/content/topics/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const TOPIC_ID = "22222222-2222-4222-8222-222222222222";
const routeCtx = { params: Promise.resolve({}) };

function request(method: "PATCH" | "DELETE", body: unknown) {
  return new NextRequest("https://portal.test/api/content/topics", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      role: "va",
      client_id: CLIENT_ID,
    },
  });
});

test("a VA cannot approve or reject a topic in their own tenant", async () => {
  for (const status of ["approved", "rejected"]) {
    const response = await PATCH(request("PATCH", {
      client_id: CLIENT_ID,
      id: TOPIC_ID,
      status,
    }), routeCtx);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Not allowed to decide content topics.",
    });
  }
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("a VA cannot delete a topic in their own tenant", async () => {
  const response = await DELETE(request("DELETE", {
    client_id: CLIENT_ID,
    id: TOPIC_ID,
  }), routeCtx);
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "Not allowed to delete content topics.",
  });
  expect(createAdminClient).not.toHaveBeenCalled();
});
