/**
 * POST /api/admin/users/login-link — one-time sign-in link for a user.
 *
 * Emails the magic link via Resend when email is configured; always also returns
 * it so the super admin can copy/share it over any channel (WhatsApp, Slack) as
 * a fallback. The link signs the user straight in, once. No password shared.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { sendEmail, emailLayout, emailConfigured } from "@/lib/email";

const schema = z.object({ id: z.string().uuid() });

export const POST = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("email, full_name").eq("id", parsed.data.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const email = (target as { email: string }).email;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const link = data?.properties?.action_link;
  if (error || !link) {
    return NextResponse.json({ error: error?.message ?? "Couldn't generate the link." }, { status: 500 });
  }

  // Email it when configured (best-effort — the returned link is the fallback).
  let emailed = false;
  if (emailConfigured()) {
    const name = (target as { full_name: string | null }).full_name?.trim();
    const res = await sendEmail({
      to: email,
      subject: "Your RapidTal sign-in link",
      html: emailLayout({
        heading: "Sign in to RapidTal",
        paragraphs: [
          `${name ? name + ", h" : "H"}ere's your one-time sign-in link. It signs you straight in — no password needed.`,
          "For your security it can only be used once and expires shortly.",
        ],
        cta: { label: "Sign in to RapidTal", href: link },
        footer: "If you didn't expect this email, you can safely ignore it.",
      }),
      text: `Sign in to RapidTal: ${link}`,
    });
    emailed = res.ok;
  }

  return NextResponse.json({ link, emailed });
});
