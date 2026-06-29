/**
 * @jest-environment node
 *
 * requireApiAuth impersonation swap. The security-critical property: the
 * impersonation cookie is honoured ONLY for a verified super_admin, so a forged
 * cookie on any other session can never escalate privilege.
 */

// Mutable per-test inputs, read by the mocks below.
let authUserId = "sa";
let cookieValue: string | undefined;

jest.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: authUserId } }, error: null }) },
  }),
}));

jest.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    get: (name: string) => (name === "rt_impersonate" && cookieValue ? { value: cookieValue } : undefined),
  }),
}));

const usersById: Record<string, { id: string; role: string; client_id: string | null }> = {
  sa: { id: "sa", role: "super_admin", client_id: null },
  va: { id: "va", role: "va", client_id: "client-A" },
  target: { id: "target", role: "va", client_id: "client-B" },
};

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          single: async () => ({ data: usersById[val] ?? null }),
        }),
      }),
    }),
  }),
}));

import { requireApiAuth } from "@/lib/api-auth";
import { __clearIdentityCache } from "@/lib/auth-cache";

beforeEach(() => {
  __clearIdentityCache();
  cookieValue = undefined;
});

describe("requireApiAuth impersonation", () => {
  test("SECURITY: a non-super-admin with an impersonation cookie is NOT swapped", async () => {
    authUserId = "va";
    cookieValue = "target"; // forged — a VA trying to become someone else
    const res = await requireApiAuth();
    expect("user" in res).toBe(true);
    if ("user" in res) {
      expect(res.user.id).toBe("va"); // stays themselves
      expect(res.user.role).toBe("va");
      expect(res.impersonating).toBeFalsy();
      expect(res.actualUser).toBeUndefined();
    }
  });

  test("a super_admin with a valid cookie is swapped to the target's identity", async () => {
    authUserId = "sa";
    cookieValue = "target";
    const res = await requireApiAuth();
    expect("user" in res).toBe(true);
    if ("user" in res) {
      expect(res.user.id).toBe("target");
      expect(res.user.role).toBe("va");
      expect(res.user.client_id).toBe("client-B");
      expect(res.impersonating).toBe(true);
      expect(res.actualUser?.id).toBe("sa");
    }
  });

  test("a super_admin without a cookie stays themselves", async () => {
    authUserId = "sa";
    const res = await requireApiAuth();
    if ("user" in res) {
      expect(res.user.id).toBe("sa");
      expect(res.impersonating).toBeFalsy();
    }
  });

  test("a stale/invalid target id falls back to the real super_admin", async () => {
    authUserId = "sa";
    cookieValue = "ghost"; // not a real user
    const res = await requireApiAuth();
    if ("user" in res) {
      expect(res.user.id).toBe("sa");
      expect(res.impersonating).toBeFalsy();
    }
  });

  test("a super_admin impersonating themselves is a no-op", async () => {
    authUserId = "sa";
    cookieValue = "sa";
    const res = await requireApiAuth();
    if ("user" in res) {
      expect(res.user.id).toBe("sa");
      expect(res.impersonating).toBeFalsy();
    }
  });
});
