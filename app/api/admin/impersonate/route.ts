/**
 * POST   /api/admin/impersonate  { userId }  — super_admin starts "viewing as" a user
 * DELETE /api/admin/impersonate              — stop impersonating
 *
 * Sets an httpOnly cookie holding the target user id. lib/auth.ts only honours
 * this cookie for a *real* super_admin session, so it can never escalate
 * privilege: a forged cookie on a non-admin session is ignored.
 *
 * Every start/stop is recorded in impersonation_log (best-effort — a missing
 * table is logged and ignored so the feature still works pre-migration).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth, withSuperAdmin } from "@/lib/api/with-auth";
import { IMPERSONATE_COOKIE } from "@/lib/auth";

const schema = z.object({ userId: z.string().uuid() });

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// Best-effort audit write — never throws into the request path.
async function logImpersonation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  entry: { actor_id: string; target_id: string | null; target_email: string | null; action: "start" | "stop" }
) {
  try {
    await admin.from("impersonation_log").insert(entry);
  } catch (e) {
    console.error("[impersonate] audit log failed:", e instanceof Error ? e.message : e);
  }
}

export const POST = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid userId." }, { status: 422 });

  if (parsed.data.userId === user.id) {
    return NextResponse.json({ error: "You are already yourself." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("id, full_name, email, role")
    .eq("id", parsed.data.userId)
    .single();

  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const t = target as { id: string; full_name: string | null; email: string; role: string };
  await logImpersonation(admin, {
    actor_id: user.id,
    target_id: t.id,
    target_email: t.email,
    action: "start",
  });

  const res = NextResponse.json({ success: true, user: target });
  res.cookies.set(IMPERSONATE_COOKIE, parsed.data.userId, { ...COOKIE_OPTS, maxAge: 60 * 60 * 8 });
  return res;
});

export const DELETE = withAuth(async (_req, { user }) => {
  // Record who we were viewing as (read before clearing) — only if the real
  // user is a super_admin, mirroring how lib/auth honours the cookie.
  const targetId = cookies().get(IMPERSONATE_COOKIE)?.value ?? null;
  if (targetId && user.role === "super_admin") {
    const admin = createAdminClient();
    const { data: target } = await admin.from("users").select("email").eq("id", targetId).single();
    await logImpersonation(admin, {
      actor_id: user.id,
      target_id: targetId,
      target_email: (target as { email: string } | null)?.email ?? null,
      action: "stop",
    });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(IMPERSONATE_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  return res;
});
