/**
 * @jest-environment node
 *
 * Tenant-isolation guard tests.
 *
 * assertClientAccess is the single function standing between one client's data
 * and another's across every API route (because routes use the service-role
 * client, which bypasses RLS). If this regresses, it's a cross-tenant leak — so
 * these cases are deliberately blunt and exhaustive.
 */
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";

const va = (clientId: string | null): ApiUser => ({ id: "u-va", role: "va", client_id: clientId });
const clientAdmin = (clientId: string | null): ApiUser => ({ id: "u-ca", role: "client_admin", client_id: clientId });
const superAdmin: ApiUser = { id: "u-sa", role: "super_admin", client_id: null };

describe("assertClientAccess", () => {
  test("super_admin reaches any client", () => {
    expect(assertClientAccess(superAdmin, "client-A")).toBeNull();
    expect(assertClientAccess(superAdmin, "client-B")).toBeNull();
  });

  test("a VA reaches their own client", () => {
    expect(assertClientAccess(va("client-A"), "client-A")).toBeNull();
  });

  test("a VA is blocked from another client (403)", () => {
    const denied = assertClientAccess(va("client-A"), "client-B");
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
  });

  test("a client_admin is blocked from another client (403)", () => {
    const denied = assertClientAccess(clientAdmin("client-A"), "client-B");
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
  });

  test("a user with no client cannot reach any real client", () => {
    const denied = assertClientAccess(va(null), "client-A");
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
  });
});
