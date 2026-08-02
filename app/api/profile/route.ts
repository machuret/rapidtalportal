import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  full_name:  z.string().min(1).max(120).optional(),
  phone:      z.string().max(30).optional().nullable(),
  birthday:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  avatar_url: z.string().url().max(500).optional().nullable(),
  timezone: z.string().trim().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone.").optional().nullable(),
});

export const GET = withAuth(async (_req, { user }) => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, email, full_name, phone, birthday, avatar_url, timezone")
    .eq("id", user.id)
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .update(parsed.data)
    .eq("id", user.id)
    .select("id, email, full_name, phone, birthday, avatar_url, timezone")
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
});

export const PUT = withAuth(async (req) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = z.object({
    new_password: z.string().min(8).max(128),
  }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 422 });
  }

  const supabase = await createClient();
  const { error: pwErr } = await supabase.auth.updateUser({
    password: parsed.data.new_password,
  });

  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
