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
import { captureError } from "@/lib/error-tracking";
import { originRejected } from "@/lib/api/csrf";

// Return type is widened to Response (not just NextResponse) so streaming
// handlers — e.g. the SSE Ask-the-Vault route returning a piped ReadableStream —
// can use the wrapper too. NextResponse already extends Response, so existing
// JSON handlers are unaffected.
type AuthedHandler<P> = (
  req: NextRequest,
  ctx: { user: ApiUser; actualUser?: ApiUser; impersonating?: boolean; params: P },
) => Promise<Response> | Response;

export function withAuth<P = Record<string, never>>(
  handler: AuthedHandler<P>,
  opts?: { roles?: ApiUser["role"][] },
) {
  return async (req: NextRequest, routeCtx?: { params: P }): Promise<Response> => {
    if (originRejected(req)) {
      return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
    }
    const auth = await requireApiAuth();
    if ("error" in auth) return auth.error;
    if (opts?.roles && !opts.roles.includes(auth.user.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    try {
      return await handler(req, {
        user: auth.user,
        actualUser: auth.actualUser,
        impersonating: auth.impersonating,
        params: (routeCtx?.params ?? {}) as P,
      });
    } catch (err) {
      // One catch instruments every wrapped route: the error is recorded for
      // /admin/errors and the caller gets a clean 500 instead of a crash page.
      // Attribute to the real actor when impersonating, not the viewed-as target.
      captureError("api", err, {
        userId: auth.actualUser?.id ?? auth.user.id,
        clientId: auth.user.client_id,
        url: req.nextUrl?.pathname,
      });
      return NextResponse.json({ error: "Something went wrong on our side. The team has been notified." }, { status: 500 });
    }
  };
}

/** Shorthand for super_admin-only routes. */
export const withSuperAdmin = <P = Record<string, never>>(handler: AuthedHandler<P>) =>
  withAuth(handler, { roles: ["super_admin"] });
