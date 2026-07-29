/**
 * @jest-environment node
 *
 * Access (credentials vault) route tests. These exercise the real route
 * handlers with the auth layer and DB client mocked, asserting the security
 * invariants that matter for a password store:
 *   - cross-tenant reads/writes are refused;
 *   - VAs cannot create/edit/delete logins (admin-only);
 *   - list responses never select the password column;
 *   - stored passwords are encrypted, not plaintext;
 *   - revealing a password writes an audit row and is tenant-scoped.
 */

const TEST_KEY = "QoULuh0atEzu2Mj27fOelKZdPt3XTQZjCznbgNFGNfA=";
process.env.CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto/credentials";
import { GET, POST, PATCH, DELETE } from "@/app/api/access/route";
import { POST as REVEAL } from "@/app/api/access/reveal/route";

type Result = { data: unknown; error: unknown };
interface RecordedCall { table: string; op: string; payload: unknown }

function makeAdmin(results: Record<string, Result>, calls: RecordedCall[] = []) {
  return {
    from(table: string) {
      const result = results[table] ?? { data: null, error: null };
      const b: Record<string, unknown> = {};
      const rec = (op: string, payload: unknown) => { calls.push({ table, op, payload }); return b; };
      b.select = (cols?: unknown) => rec("select", cols);
      b.insert = (vals: unknown) => rec("insert", vals);
      b.update = (vals: unknown) => rec("update", vals);
      b.delete = () => rec("delete", null);
      b.eq = () => b;
      b.or = () => b;
      b.order = () => b;
      b.maybeSingle = async () => result;
      b.single = async () => result;
      b.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject);
      return b;
    },
  };
}

// Route schemas require UUIDs, so ids must be well-formed.
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const CRED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const asAuth = (user: ApiUser) => (requireApiAuth as jest.Mock).mockResolvedValue({ user });
const va = (clientId: string): ApiUser => ({ id: "u-va", role: "va", client_id: clientId });
const admin = (clientId: string): ApiUser => ({ id: "u-ca", role: "client_admin", client_id: clientId });

const jsonReq = (body: unknown) => ({ json: async () => body }) as never;
const getReq = (params: Record<string, string>) =>
  ({ nextUrl: { searchParams: new URLSearchParams(params) } }) as never;
const routeCtx = { params: Promise.resolve({}) };

beforeEach(() => jest.clearAllMocks());

describe("GET /api/access", () => {
  test("a VA cannot list another client's logins", async () => {
    asAuth(va(CLIENT_A));
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({}));
    const res = await GET(getReq({ clientId: CLIENT_B }), routeCtx);
    expect(res.status).toBe(403);
  });

  test("a list never selects the password column", async () => {
    asAuth(va(CLIENT_A));
    const calls: RecordedCall[] = [];
    (createAdminClient as jest.Mock).mockReturnValue(
      makeAdmin({ access_credentials: { data: [], error: null } }, calls),
    );
    const res = await GET(getReq({}), routeCtx);
    expect(res.status).toBe(200);
    const selects = calls.filter((c) => c.op === "select").map((c) => String(c.payload));
    expect(selects.length).toBeGreaterThan(0);
    for (const cols of selects) expect(cols).not.toContain("password");
  });
});

describe("POST /api/access", () => {
  test("a VA cannot create a login (admin-only)", async () => {
    asAuth(va(CLIENT_A));
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({}));
    const res = await POST(jsonReq({ clientId: CLIENT_A, site: "S", category: "C", password: "p" }), routeCtx);
    expect(res.status).toBe(403);
  });

  test("an admin cannot create a login for another client", async () => {
    asAuth(admin(CLIENT_A));
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({}));
    const res = await POST(jsonReq({ clientId: CLIENT_B, site: "S", category: "C", password: "p" }), routeCtx);
    expect(res.status).toBe(403);
  });

  test("an admin creates a login and the password is stored encrypted", async () => {
    asAuth(admin(CLIENT_A));
    const calls: RecordedCall[] = [];
    (createAdminClient as jest.Mock).mockReturnValue(
      makeAdmin({ access_credentials: { data: { id: "new", site: "S" }, error: null } }, calls),
    );
    const res = await POST(jsonReq({
      clientId: CLIENT_A, site: "WordPress", category: "Website",
      username: "admin", password: "letmein123",
    }), routeCtx);
    expect(res.status).toBe(201);
    const insert = calls.find((c) => c.op === "insert")?.payload as Record<string, string>;
    expect(insert.password_enc).toBeDefined();
    expect(insert.password_enc).not.toContain("letmein123");
    expect(decryptSecret(insert.password_enc)).toBe("letmein123");
  });
});

describe("PATCH / DELETE /api/access", () => {
  test("an admin cannot edit a login belonging to another client", async () => {
    asAuth(admin(CLIENT_A));
    (createAdminClient as jest.Mock).mockReturnValue(
      makeAdmin({ access_credentials: { data: { id: CRED, client_id: CLIENT_B }, error: null } }),
    );
    const res = await PATCH(jsonReq({ id: CRED, site: "X" }), routeCtx);
    expect(res.status).toBe(403);
  });

  test("a VA cannot delete a login (admin-only)", async () => {
    asAuth(va(CLIENT_A));
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({}));
    const res = await DELETE(jsonReq({ id: CRED }), routeCtx);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/access/reveal", () => {
  test("a VA cannot reveal a password from another client, and no audit row is written", async () => {
    asAuth(va(CLIENT_A));
    const calls: RecordedCall[] = [];
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
      access_credentials: { data: { id: CRED, client_id: CLIENT_B, password_enc: encryptSecret("nope") }, error: null },
    }, calls));
    const res = await REVEAL(jsonReq({ id: CRED }), routeCtx);
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.table === "access_credential_reveals" && c.op === "insert")).toBe(false);
  });

  test("a burst of reveals is throttled with 429 (anti bulk-export)", async () => {
    // Distinct user so the limiter state never interferes with other tests.
    asAuth({ id: "u-burst", role: "va", client_id: CLIENT_A });
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
      access_credentials: { data: { id: CRED, client_id: CLIENT_A, password_enc: encryptSecret("pw") }, error: null },
      access_credential_reveals: { data: null, error: null },
    }));
    let throttled = 0;
    for (let i = 0; i < 40; i++) {
      const res = await REVEAL(jsonReq({ id: CRED }), routeCtx);
      if (res.status === 429) throttled++;
    }
    expect(throttled).toBe(10); // 30 allowed per window, the next 10 rejected
  });

  test("a VA reveals a password from their own client and the access is audited", async () => {
    asAuth(va(CLIENT_A));
    const calls: RecordedCall[] = [];
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
      access_credentials: { data: { id: CRED, client_id: CLIENT_A, password_enc: encryptSecret("s3cret") }, error: null },
      access_credential_reveals: { data: null, error: null },
    }, calls));
    const res = await REVEAL(jsonReq({ id: CRED }), routeCtx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ password: "s3cret" });
    const audit = calls.find((c) => c.table === "access_credential_reveals" && c.op === "insert")?.payload as Record<string, string>;
    expect(audit).toBeDefined();
    expect(audit.credential_id).toBe(CRED);
    expect(audit.user_id).toBe("u-va");
  });

  test("a password is not disclosed when the audit insert fails", async () => {
    asAuth({ id: "u-audit-fail", role: "va", client_id: CLIENT_A });
    (createAdminClient as jest.Mock).mockReturnValue(makeAdmin({
      access_credentials: {
        data: { id: CRED, client_id: CLIENT_A, password_enc: encryptSecret("must-stay-secret") },
        error: null,
      },
      access_credential_reveals: {
        data: null,
        error: { code: "42501", message: "audit table unavailable" },
      },
    }));

    const res = await REVEAL(jsonReq({ id: CRED }), routeCtx);
    expect(res.status).toBe(503);
    const payload = await res.json();
    expect(payload).not.toHaveProperty("password");
  });
});
