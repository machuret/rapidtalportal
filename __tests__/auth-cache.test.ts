/**
 * @jest-environment node
 *
 * The auth identity cache shortcuts the per-request role lookup. It sits on the
 * auth path, so the invariants that matter are blunt: it must never return a
 * stale entry past the TTL, never cross user ids, and forget on demand.
 */
import {
  getCachedIdentity,
  setCachedIdentity,
  invalidateCachedIdentity,
  __clearIdentityCache,
  ROLE_TTL_MS,
} from "@/lib/auth-cache";

beforeEach(() => __clearIdentityCache());

describe("auth-cache", () => {
  test("returns null on a miss", () => {
    expect(getCachedIdentity("nobody")).toBeNull();
  });

  test("returns the value within the TTL", () => {
    setCachedIdentity("u1", { role: "va", client_id: "c1" }, 1000);
    expect(getCachedIdentity("u1", 1000 + ROLE_TTL_MS - 1)).toEqual({ role: "va", client_id: "c1" });
  });

  test("expires after the TTL", () => {
    setCachedIdentity("u1", { role: "va", client_id: "c1" }, 1000);
    expect(getCachedIdentity("u1", 1000 + ROLE_TTL_MS + 1)).toBeNull();
  });

  test("never crosses user ids", () => {
    setCachedIdentity("u1", { role: "super_admin", client_id: null }, 1000);
    expect(getCachedIdentity("u2", 1000)).toBeNull();
  });

  test("invalidate forgets immediately", () => {
    setCachedIdentity("u1", { role: "client_admin", client_id: "c1" }, 1000);
    invalidateCachedIdentity("u1");
    expect(getCachedIdentity("u1", 1000)).toBeNull();
  });
});
