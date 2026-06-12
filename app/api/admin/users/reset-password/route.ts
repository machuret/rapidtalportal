/**
 * POST /api/admin/users/reset-password — set a new password for a user.
 *
 * No SMTP in this deployment, so instead of a reset email the super admin sets
 * (or auto-generates) a password and shares it over their existing channel —
 * mirrors the one-time login-link approach. The new password is returned ONCE
 * so it can be copied; it is never stored anywhere by us.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";

const schema = z.object({
  id: z.string().uuid(),
  // Optional: omit to auto-generate a strong one.
  password: z.string().min(8).max(72).optional(),
});

/** Readable-ish strong password: 16 url-safe chars. */
function generatePassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

export const POST = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("id, email").eq("id", parsed.data.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const password = parsed.data.password ?? generatePassword();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ password, email: (target as { email: string }).email });
});
