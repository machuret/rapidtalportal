/** @jest-environment node */

import { NextRequest } from "next/server";

jest.mock("@/lib/api-auth", () => ({
  requireApiAuth: jest.fn(async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111", client_id: "22222222-2222-4222-8222-222222222222", role: "client_admin" },
  })),
}));
jest.mock("@/lib/api/csrf", () => ({ originRejected: () => false }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  clientExperienceLimiter: { check: jest.fn() },
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
jest.mock("@/lib/error-tracking", () => ({ captureError: jest.fn() }));

import { POST } from "@/app/api/experience/events/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientExperienceLimiter } from "@/lib/rate-limit";

const mockInsert = jest.fn();
const mockCreateAdminClient = createAdminClient as jest.Mock;
const mockCheck = clientExperienceLimiter.check as jest.Mock;

function request(body: unknown) {
  return new NextRequest("https://portal.test/api/experience/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("client experience event route", () => {
  beforeEach(() => {
    mockInsert.mockReset().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReset().mockReturnValue({ from: () => ({ insert: mockInsert }) });
    mockCheck.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  test("attributes timing to the authenticated tenant and actor", async () => {
    const response = await POST(request({
      eventType: "feature_ready",
      path: "/reports",
      durationMs: 3100,
      navigationId: "33333333-3333-4333-8333-333333333333",
      attempt: 1,
      metadata: { feature: "monthly_reports" },
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(204);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      client_id: "22222222-2222-4222-8222-222222222222",
      user_id: "11111111-1111-4111-8111-111111111111",
      event_type: "feature_ready",
      path: "/reports",
      duration_ms: 3100,
      navigation_id: "33333333-3333-4333-8333-333333333333",
      attempt: 1,
    }));
  });

  test("rejects unknown events and non-portal paths", async () => {
    const response = await POST(request({ eventType: "arbitrary", path: "https://elsewhere.test" }), { params: Promise.resolve({}) });
    expect(response.status).toBe(422);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
