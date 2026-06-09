/**
 * POST   /api/admin/impersonate  { userId }  — super_admin starts "viewing as" a user
 * DELETE /api/admin/impersonate              — stop impersonating
 *
 * Sets an httpOnly cookie holding the target user id. lib/auth.ts only honours
 * this cookie for a *real* super_admin session, so it can never escalate
 * privilege: a forged cookie on a non-admin session is ignored.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPERSONATE_COOKIE } from "@/lib/auth";

const schema = z.object({ userId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  if (auth.user.role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid userId." }, { status: 422 });

  if (parsed.data.userId === auth.user.id) {
    return NextResponse.json({ error: "You are already yourself." }, { status: 400 });
  }

  // Validate target exists
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("id, full_name, email, role")
    .eq("id", parsed.data.userId)
    .single();

  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const res = NextResponse.json({ success: true, user: target });
  res.cookies.set(IMPERSONATE_COOKIE, parsed.data.userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}

export async function DELETE() {
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;

  // Anyone may clear their own impersonation cookie (no-op if absent).
  const res = NextResponse.json({ success: true });
  res.cookies.set(IMPERSONATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
