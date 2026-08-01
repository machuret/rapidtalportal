/**
 * Shared Bearer/JWT authorization for the RapidTal edge functions.
 *
 * Centralises the flow every function used to hand-roll:
 *   Bearer token → (optional service-key bypass) → getUser() → users row
 *   → role / client checks.
 *
 * SECURITY-CRITICAL: the status codes and error bodies produced here are
 * byte-compatible with what each function returned inline before the
 * extraction. Do not change them, and do not weaken any check:
 *
 *   - 401 { error: "Unauthorized." }              — missing/invalid Bearer JWT
 *   - 403 { error: "Forbidden." }                 — role/client mismatch
 *   - 403 { error: "User record not found." }     — JWT valid, no users row
 *
 * Variants (match the functions that had them inline):
 *   - requireSuperAdmin — business-library-index: anything but a super_admin
 *     users row gets 403 "Forbidden." (a missing row is also "Forbidden.",
 *     not "User record not found.").
 *   - blockSuperAdmin — send-message: super_admins get 403 "Super admins
 *     cannot send messages." and users without a client get 403 "User has no
 *     client assigned.".
 *   - allowedRoles — vault-delete: roles outside the list get 403 with
 *     forbiddenMessage.
 *   - allowServiceKey — business-library-index / vault-process: a request
 *     presenting the service-role key as its token is a trusted
 *     server-to-server call and skips the user/role checks (acts as
 *     super_admin with no client). Only our own backend holds that key.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "./cors.ts";

export type AuthorizeOptions = {
  allowServiceKey?: boolean;
  requireSuperAdmin?: boolean;
  blockSuperAdmin?: boolean;
  allowedRoles?: string[];
  forbiddenMessage?: string;
  /** Columns selected from the users row. Default "role, client_id". */
  select?: string;
  /** Dependency injection for tests (content-generate). */
  createClientImpl?: typeof createClient;
  envGet?: (key: string) => string | undefined;
  /** CORS headers used on failure responses (content-generate computes its
   * own from the injected envGet). Default: the shared corsHeaders. */
  headers?: Record<string, string>;
};

export type AuthorizedIdentity =
  | {
    ok: true;
    isInternal: true;
    jwt: string;
    authUserId: null;
    role: "super_admin";
    userClientId: null;
    userRow: null;
    // deno-lint-ignore no-explicit-any
    admin: any;
  }
  | {
    ok: true;
    isInternal: false;
    jwt: string;
    authUserId: string;
    role: string;
    userClientId: string | null;
    // deno-lint-ignore no-explicit-any
    userRow: Record<string, any>;
    // deno-lint-ignore no-explicit-any
    admin: any;
  };

export type AuthDenied = { ok: false; response: Response };

export async function authorizeRequest(
  req: Request,
  options: AuthorizeOptions = {},
): Promise<AuthorizedIdentity | AuthDenied> {
  const createClientImpl = options.createClientImpl ?? createClient;
  const envGet = options.envGet ?? ((key: string) => Deno.env.get(key));
  const headers = options.headers ?? corsHeaders;
  const deny = (body: unknown, status: number): AuthDenied => ({
    ok: false,
    response: jsonResponse(body, status, headers),
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return deny({ error: "Unauthorized." }, 401);
  const jwt = authHeader.replace("Bearer ", "");

  const supabaseUrl = envGet("SUPABASE_URL")!;
  const serviceKey = envGet("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = envGet("SUPABASE_ANON_KEY")!;

  // Trusted server-to-server bypass — the service-role key is the token.
  // Skips getUser and the users-row checks entirely.
  if (options.allowServiceKey && jwt === serviceKey) {
    const admin = createClientImpl(supabaseUrl, serviceKey);
    return {
      ok: true,
      isInternal: true,
      jwt,
      authUserId: null,
      role: "super_admin",
      userClientId: null,
      userRow: null,
      admin,
    };
  }

  // The anon client is constructed before the service client — the
  // content-generate tenant-boundary tests rely on this call order.
  const userClient = createClientImpl(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
  if (authError || !authUser) return deny({ error: "Unauthorized." }, 401);

  const admin = createClientImpl(supabaseUrl, serviceKey);

  // The users row is selected with a caller-chosen column list, so the query
  // builder cannot infer a row type — treat it as untyped, like the inline
  // code in each function did.
  // deno-lint-ignore no-explicit-any
  const userRow = (await admin
    .from("users")
    .select(options.select ?? "role, client_id")
    .eq("id", authUser.id)
    // deno-lint-ignore no-explicit-any
    .single()).data as any;

  if (options.requireSuperAdmin) {
    if (!userRow || userRow.role !== "super_admin") {
      return deny({ error: "Forbidden." }, 403);
    }
  } else if (!userRow) {
    return deny({ error: "User record not found." }, 403);
  }

  const role = userRow.role as string;
  const userClientId = (userRow.client_id ?? null) as string | null;

  if (options.blockSuperAdmin) {
    if (role === "super_admin") {
      return deny({ error: "Super admins cannot send messages." }, 403);
    }
    if (!userClientId) {
      return deny({ error: "User has no client assigned." }, 403);
    }
  }

  if (options.allowedRoles && !options.allowedRoles.includes(role)) {
    return deny({ error: options.forbiddenMessage ?? "Forbidden." }, 403);
  }

  return {
    ok: true,
    isInternal: false,
    jwt,
    authUserId: authUser.id,
    role,
    userClientId,
    userRow,
    admin,
  };
}

/**
 * Standard tenant-membership gate shared by most functions:
 * super_admins cross tenants freely; everyone else must belong to clientId.
 * Returns the 403 Response to send, or null when access is allowed.
 * Byte-identical to the inline `return …{ error: "Forbidden." }, 403…`.
 */
export function checkClientMembership(
  role: string,
  userClientId: string | null,
  clientId: unknown,
  headers: Record<string, string> = corsHeaders,
): Response | null {
  if (role !== "super_admin" && userClientId !== clientId) {
    return jsonResponse({ error: "Forbidden." }, 403, headers);
  }
  return null;
}
