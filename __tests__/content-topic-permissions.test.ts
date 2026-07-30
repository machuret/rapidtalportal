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
  POST,
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

function postRequest(body: unknown) {
  return new NextRequest("https://portal.test/api/content/topics", {
    method: "POST",
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

test("a VA cannot create an already-approved idea", async () => {
  const response = await POST(postRequest({
    client_id: CLIENT_ID,
    title: "A generated idea",
    content_type: "linkedin",
    status: "approved",
  }), routeCtx);

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "Not allowed to approve content topics.",
  });
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("a client admin can atomically save a generated idea as approved", async () => {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      role: "client_admin",
      client_id: CLIENT_ID,
    },
  });
  const saved = {
    id: TOPIC_ID,
    client_id: CLIENT_ID,
    title: "A generated idea",
    description: null,
    content_type: "linkedin",
    status: "approved",
  };
  const topicInsert = jest.fn(() => ({
    select: jest.fn(() => ({
      single: jest.fn().mockResolvedValue({ data: saved, error: null }),
    })),
  }));
  const signalInsert = jest.fn().mockResolvedValue({ error: null });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => ({
      insert: table === "content_topics" ? topicInsert : signalInsert,
    })),
  });

  const response = await POST(postRequest({
    client_id: CLIENT_ID,
    title: "A generated idea",
    content_type: "linkedin",
    status: "approved",
  }), routeCtx);

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    id: TOPIC_ID,
    status: "approved",
  });
  expect(topicInsert).toHaveBeenCalledWith(expect.objectContaining({
    status: "approved",
    approved_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    approved_at: expect.any(String),
  }));
  expect(signalInsert).toHaveBeenCalledWith(expect.objectContaining({
    artifact_id: TOPIC_ID,
    rating: 1,
  }));
});
