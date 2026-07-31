/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { PATCH, POST } from "@/app/api/brain/learning-inbox/route";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUGGESTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const routeCtx = { params: Promise.resolve({}) };

function user(role: ApiUser["role"], clientId: string | null = CLIENT_A): ApiUser {
  return { id: USER_ID, role, client_id: clientId };
}

function request(body: unknown) {
  return { json: async () => body } as never;
}

function rpcResult(data: unknown) {
  return {
    single: jest.fn().mockResolvedValue({ data, error: null }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Brain learning inbox permissions", () => {
  it("allows VA feedback decisions but never permanent approval", async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({ user: user("va") });
    const admin = { rpc: jest.fn(), from: jest.fn() };
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await PATCH(request({
      client_id: CLIENT_A,
      id: SUGGESTION_ID,
      action: "approve",
    }), routeCtx);

    expect(response.status).toBe(403);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it.each(["client_admin", "super_admin"] as const)(
    "allows %s to approve a reviewed suggestion through the guarded RPC",
    async (role) => {
      (requireApiAuth as jest.Mock).mockResolvedValue({
        user: user(role, role === "super_admin" ? null : CLIENT_A),
      });
      const admin = {
        rpc: jest.fn(() => rpcResult({ id: SUGGESTION_ID, status: "approved" })),
      };
      (createAdminClient as jest.Mock).mockReturnValue(admin);

      const response = await PATCH(request({
        client_id: CLIENT_A,
        id: SUGGESTION_ID,
        action: "approve",
        scope: { surfaces: ["content"], channels: ["linkedin"], global: false },
      }), routeCtx);

      expect(response.status).toBe(200);
      expect(admin.rpc).toHaveBeenCalledWith(
        "approve_editorial_learning_suggestion",
        expect.objectContaining({
          p_client_id: CLIENT_A,
          p_suggestion_id: SUGGESTION_ID,
          p_actor_id: USER_ID,
          p_scope: expect.objectContaining({ channels: ["linkedin"] }),
        }),
      );
    },
  );

  it("rejects cross-tenant teaching actions before reading suggestions", async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({ user: user("va") });
    const admin = { rpc: jest.fn(), from: jest.fn() };
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await POST(request({
      client_id: CLIENT_B,
      id: SUGGESTION_ID,
      action: "remember_channel",
    }), routeCtx);

    expect(response.status).toBe(403);
    expect(admin.from).not.toHaveBeenCalled();
  });
});
