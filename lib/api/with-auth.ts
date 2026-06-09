/**
 * Route-handler wrappers that centralise the auth/role boilerplate repeated at
 * the top of every API route (requireApiAuth → role check → handler).
 *
 * Usage:
 *   export const POST = withSuperAdmin(async (req, { user }) => { ... });
 *   export const PATCH = withSuperAdmin<{ id: string }>(async (req, { user, params }) => { ... });
 *   export const GET = withAuth(async (req, { user }) => { ... }, { roles: ["client_admin","super_admin"] });
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";

type AuthedHandler<P> = (
  req: NextRequest,
  ctx: { user: ApiUser; params: P },
) => Promise<NextResponse> | NextResponse;

export function withAuth<P = Record<string, never>>(
  handler: AuthedHandler<P>,
  opts?: { roles?: ApiUser["role"][] },
) {
  return async (req: NextRequest, routeCtx?: { params: P }): Promise<NextResponse> => {
    const auth = await requireApiAuth();
    if ("error" in auth) return auth.error;
    if (opts?.roles && !opts.roles.includes(auth.user.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    return handler(req, { user: auth.user, params: (routeCtx?.params ?? {}) as P });
  };
}

/** Shorthand for super_admin-only routes. */
export const withSuperAdmin = <P = Record<string, never>>(handler: AuthedHandler<P>) =>
  withAuth(handler, { roles: ["super_admin"] });
