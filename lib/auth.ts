import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DbUser, DbClient } from "@/types/database";

/** Cookie holding the user id a super_admin is currently impersonating. */
export const IMPERSONATE_COOKIE = "rt_impersonate";

const USER_COLUMNS =
  "id, email, full_name, role, client_id, created_at, phone, birthday, avatar_url, timezone";

export interface CurrentUserAndClient {
  /** Effective user — the impersonated target when impersonating, else the real user. */
  user: DbUser;
  client: DbClient | null;
  /** True when a super_admin is viewing the app as another user. */
  impersonating?: boolean;
  /** The real super_admin behind the session (only set while impersonating). */
  actualUser?: DbUser;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadClient(admin: any, clientId: string | null): Promise<DbClient | null> {
  if (!clientId) return null;
  const { data } = await admin
    .from("clients")
    .select("id, name, slug, created_at, created_by")
    .eq("id", clientId)
    .single();
  return (data as DbClient) ?? null;
}

/**
 * Fetches the authenticated user + their client.
 * Wrapped with React.cache() so multiple callers within the same server
 * render tree (e.g. layout + page) share one result — zero duplicate queries.
 *
 * Impersonation: if a super_admin has an IMPERSONATE_COOKIE set, the returned
 * `user`/`client` are the *target's*, with `impersonating: true` and the real
 * admin in `actualUser`. The cookie is only ever honoured for a real
 * super_admin session, so it can't be used for privilege escalation.
 */
export const getCurrentUserAndClient = cache(
  async (): Promise<CurrentUserAndClient | null> => {
    const supabase = createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) return null;

    const admin = createAdminClient();

    const { data: userRow } = await admin
      .from("users")
      .select(USER_COLUMNS)
      .eq("id", authUser.id)
      .single();

    if (!userRow) return null;

    const realUser = userRow as DbUser;

    // ── Impersonation (super_admin only) ──────────────────────────────────────
    const impersonateId = cookies().get(IMPERSONATE_COOKIE)?.value;
    if (realUser.role === "super_admin" && impersonateId && impersonateId !== realUser.id) {
      const { data: targetRow } = await admin
        .from("users")
        .select(USER_COLUMNS)
        .eq("id", impersonateId)
        .single();

      if (targetRow) {
        const target = targetRow as DbUser;
        return {
          user: target,
          client: await loadClient(admin, target.client_id),
          impersonating: true,
          actualUser: realUser,
        };
      }
      // Stale/invalid target → fall through to the real user.
    }

    return { user: realUser, client: await loadClient(admin, realUser.client_id) };
  }
);

export async function requireRole(
  allowedRoles: DbUser["role"][]
): Promise<CurrentUserAndClient> {
  const result = await getCurrentUserAndClient();
  if (!result) throw new Error("UNAUTHENTICATED");
  if (!allowedRoles.includes(result.user.role)) throw new Error("FORBIDDEN");
  return result;
}

/**
 * Page guard for /admin/* — redirects unauthenticated users to login and
 * non-super-admins to their dashboard. Replaces the 3-line guard copy-pasted
 * at the top of every admin page. Returns the (non-null) context.
 */
export async function requireSuperAdmin(): Promise<CurrentUserAndClient> {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");
  return ctx;
}
