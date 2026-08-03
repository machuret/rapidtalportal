/** @jest-environment node */

import { NextRequest } from "next/server";

jest.mock("@/lib/api-auth", () => ({
  requireApiAuth: jest.fn(async () => ({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      client_id: "22222222-2222-4222-8222-222222222222",
      role: "client_admin",
    },
  })),
}));
jest.mock("@/lib/api/csrf", () => ({ originRejected: () => false }));
jest.mock("@/lib/error-tracking", () => ({ captureError: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => {
  const rpc = jest.fn();
  const selectEq = jest.fn();
  return {
    __mocks: { rpc, selectEq },
    createAdminClient: () => ({
      rpc,
      from: () => ({ select: () => ({ eq: selectEq }) }),
    }),
  };
});
jest.mock("@/lib/notifications", () => {
  const notify = jest.fn();
  return { __mocks: { notify }, notify };
});
jest.mock("@/lib/rate-limit", () => ({
  onboardingMutationLimiter: { check: jest.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })) },
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

import { POST } from "@/app/api/onboarding/request-va/route";

const { rpc: mockRpc, selectEq: mockSelectEq } = (jest.requireMock("@/lib/supabase/admin") as {
  __mocks: { rpc: jest.Mock; selectEq: jest.Mock };
}).__mocks;
const { notify: mockNotify } = (jest.requireMock("@/lib/notifications") as {
  __mocks: { notify: jest.Mock };
}).__mocks;

describe("client VA assignment request", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: "33333333-3333-4333-8333-333333333333", error: null });
    mockSelectEq.mockResolvedValue({ data: [{ id: "44444444-4444-4444-8444-444444444444" }], error: null });
    mockNotify.mockResolvedValue(undefined);
  });

  test("uses only the authenticated tenant and not caller-supplied ids", async () => {
    const response = await POST(new NextRequest("https://portal.test/api/onboarding/request-va", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "99999999-9999-4999-8999-999999999999" }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("request_client_va_assignment", {
      p_client_id: "22222222-2222-4222-8222-222222222222",
      p_requested_by: "11111111-1111-4111-8111-111111111111",
    });
    expect(mockNotify).toHaveBeenCalledWith(
      ["44444444-4444-4444-8444-444444444444"],
      expect.objectContaining({ href: "/admin/clients/22222222-2222-4222-8222-222222222222" }),
    );
  });

  test("returns a clear conflict when a VA is already assigned", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "va_already_assigned", code: "23505" } });
    const response = await POST(new NextRequest("https://portal.test/api/onboarding/request-va", { method: "POST" }), { params: Promise.resolve({}) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/already assigned/i) });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
