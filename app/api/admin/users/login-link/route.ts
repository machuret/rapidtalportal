/**
 * POST /api/admin/users/login-link — one-time sign-in link for a user.
 *
 * Onboarding without SMTP: the super admin copies the magic link and sends it
 * over whatever channel they already use (WhatsApp, email, Slack). The link
 * signs the user straight in, once. No password ever needs to be shared.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";

const schema = z.object({ id: z.string().uuid() });

export const POST = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("email").eq("id", parsed.data.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: (target as { email: string }).email,
  });
  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? "Couldn't generate the link." }, { status: 500 });
  }

  return NextResponse.json({ link: data.properties.action_link });
});
