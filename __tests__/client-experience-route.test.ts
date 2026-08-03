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

const mockUpsert = jest.fn();
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
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReset().mockReturnValue({ from: () => ({ upsert: mockUpsert }) });
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
    expect(mockUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        client_id: "22222222-2222-4222-8222-222222222222",
        user_id: "11111111-1111-4111-8111-111111111111",
        actor_role: "client_admin",
        event_type: "feature_ready",
        path: "/reports",
        duration_ms: 3100,
        navigation_id: "33333333-3333-4333-8333-333333333333",
        attempt: 1,
      }),
    ], { onConflict: "id", ignoreDuplicates: true });
  });

  test("rejects unknown events and non-portal paths", async () => {
    const response = await POST(request({ eventType: "arbitrary", path: "https://elsewhere.test" }), { params: Promise.resolve({}) });
    expect(response.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("records findability outcomes without raw search text", async () => {
    const response = await POST(request({
      eventType: "navigation_destination_opened",
      path: "/vault",
      targetPath: "/content/quick",
      eventId: "44444444-4444-4444-8444-444444444444",
      navigationId: "55555555-5555-4555-8555-555555555555",
      interactionId: "55555555-5555-4555-8555-555555555555",
      metadata: {
        source: "command_palette_search",
        query_token_count: 3,
        result_count: 1,
      },
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(204);
    expect(mockUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "44444444-4444-4444-8444-444444444444",
        event_type: "navigation_destination_opened",
        path: "/vault",
        target_path: "/content/quick",
        metadata: { source: "command_palette_search", query_token_count: 3, result_count: 1 },
      }),
    ], { onConflict: "id", ignoreDuplicates: true });
  });

  test.each(["query", "search_text", "prompt", "content"])("rejects sensitive metadata key %s", async (key) => {
    const response = await POST(request({
      eventType: "guide_search_used",
      path: "/guide",
      metadata: { [key]: "private client words" },
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("canonicalises dynamic routes and discards query strings before storage", async () => {
    const response = await POST(request({
      eventType: "page_ready",
      path: "/crm/99999999-9999-4999-8999-999999999999?private=words",
      metadata: { stage: "route_shell" },
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(204);
    expect(mockUpsert).toHaveBeenCalledWith([
      expect.objectContaining({ path: "/crm/:item" }),
    ], expect.any(Object));
  });

  test("rejects arbitrary strings hidden in otherwise allowed metadata fields", async () => {
    const response = await POST(request({
      eventType: "contextual_help_opened",
      path: "/vault",
      metadata: { source: "private client words" },
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("accepts an idempotent batch", async () => {
    const eventId = "66666666-6666-4666-8666-666666666666";
    const response = await POST(request({ events: [{
      eventType: "page_slow",
      eventId,
      path: "/vault",
      durationMs: 9000,
      metadata: {},
    }] }), { params: Promise.resolve({}) });
    expect(response.status).toBe(204);
    expect(mockUpsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: eventId, event_type: "page_slow" }),
    ], { onConflict: "id", ignoreDuplicates: true });
  });
});
