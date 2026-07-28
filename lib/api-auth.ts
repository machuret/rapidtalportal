import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedIdentity, setCachedIdentity } from "@/lib/auth-cache";
import { IMPERSONATE_COOKIE } from "@/lib/impersonation";

export interface ApiUser {
  id: string;
  role: string;
  client_id: string | null;
}

export interface AuthedContext {
  /** Effective caller — the impersonated target when a super_admin is viewing as someone. */
  user: ApiUser;
  /** The real super_admin behind the request; set only while impersonating. */
  actualUser?: ApiUser;
  impersonating?: boolean;
}

/**
 * Resolve {id, role, client_id} for an already-verified user id. The role/client
 * lookup is cached per warm instance for a short TTL (getUser() still verifies
 * the JWT on every request; only this DB read is cached, and only briefly).
 */
async function resolveIdentity(userId: string): Promise<ApiUser | null> {
  const cached = getCachedIdentity(userId);
  if (cached) return { id: userId, role: cached.role, client_id: cached.client_id };

  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("id, role, client_id")
    .eq("id", userId)
    .single();
  if (!data) return null;

  const u = data as ApiUser;
  setCachedIdentity(u.id, { role: u.role, client_id: u.client_id });
  return u;
}

/**
 * Validates the incoming request session via Supabase cookie auth.
 * Returns the authenticated caller (id, role, client_id) or a 401 NextResponse.
 * Never trusts clientId/userId from the request body for auth purposes.
 *
 * Impersonation: when a real super_admin has an IMPERSONATE_COOKIE set, the
 * returned `user` is the TARGET's identity (with the real admin in `actualUser`),
 * mirroring the page-level swap in lib/auth. The cookie is honoured ONLY for a
 * verified super_admin, so it can never escalate privilege — and API calls during
 * a "view as" session now correctly run with the target's role/tenant (e.g.
 * withSuperAdmin routes 403, tenant scoping follows the target's client).
 */
export async function requireApiAuth(): Promise<AuthedContext | { error: NextResponse }> {
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only in API routes */ },
      },
    }
  );

  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const real = await resolveIdentity(authUser.id);
  if (!real) {
    return {
      error: NextResponse.json({ error: "User record not found." }, { status: 403 }),
    };
  }

  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (real.role === "super_admin" && impersonateId && impersonateId !== authUser.id) {
    const target = await resolveIdentity(impersonateId);
    if (target) return { user: target, actualUser: real, impersonating: true };
    // Stale/invalid target id → fall through to the real super_admin.
  }

  return { user: real };
}

/**
 * Asserts the authenticated user owns or has access to the given clientId.
 * super_admin can access any client. Others must match their own client_id.
 */
export function assertClientAccess(user: ApiUser, clientId: string): NextResponse | null {
  if (user.role === "super_admin") return null;
  if (user.client_id !== clientId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}
